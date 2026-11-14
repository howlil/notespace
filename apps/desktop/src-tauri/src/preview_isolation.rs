use std::sync::atomic::Ordering;
use tauri::{
    plugin::{Builder as PluginBuilder, TauriPlugin},
    AppHandle, Manager, Url, Wry,
};

use crate::runtime::RuntimeProcess;

pub(crate) const PREVIEW_HOST_FRAME_NAME: &str = "notespace-html-preview-host";
pub(crate) const PREVIEW_CONTENT_FRAME_NAME: &str = "notespace-html-preview";

// Guard WebView2 global init scripts in Rust too: on Windows wry runs every
// init script inside child frames as well as the top window. Only the top app
// window may delegate external links to opener; child frames strip any
// exposed WebView2 bridge before preview markup executes.
const ISOLATION_INIT_SCRIPT: &str = r#"
(() => {
  if (window === window.top) {
    window.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey) return;
      const anchor = event.composedPath().find((node) => node instanceof Node && node.nodeName && node.nodeName.toUpperCase() === "A");
      if (!anchor || !anchor.href) return;
      if (anchor.target !== "_blank" && !event.ctrlKey && !event.shiftKey) return;
      let parsed;
      try {
        parsed = new URL(anchor.href);
      } catch {
        return;
      }
      if (!["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)) return;
      event.preventDefault();
      void window.__TAURI_INTERNALS__?.invoke?.("plugin:opener|open_url", { url: parsed.href });
    });
    return;
  }
  try {
    if (window.chrome && "webview" in window.chrome) {
      Object.defineProperty(window.chrome, "webview", {
        value: undefined,
        configurable: false,
        writable: false,
      });
    }
  } catch {}
  try {
    Object.defineProperty(window, "chrome", {
      value: Object.freeze({}),
      configurable: false,
      writable: false,
    });
  } catch {}
})();
"#;

pub(crate) fn isolation_plugin() -> TauriPlugin<Wry> {
    PluginBuilder::new("notespace-isolation")
        .js_init_script_on_all_frames(ISOLATION_INIT_SCRIPT)
        .on_navigation(|webview, url| {
            // On macOS and Linux wry routes child-frame navigations through this
            // callback too; Windows enforces main vs subframe separation directly
            // via NavigationStarting and FrameNavigationStarting/FrameCreated.
            #[cfg(not(windows))]
            if url.as_str() == "about:srcdoc"
                || (matches!(url.scheme(), "https" | "http")
                    && url
                        .host_str()
                        .is_some_and(|host| !is_local_host(host)))
            {
                return true;
            }
            let app = webview.app_handle();
            let allowed_origin = app
                .try_state::<RuntimeProcess>()
                .and_then(|state| state.allowed_origin.lock().ok().and_then(|slot| slot.clone()));
            let recovery_visible = app
                .try_state::<RuntimeProcess>()
                .is_some_and(|state| state.recovery_visible.load(Ordering::Acquire));
            is_allowed_main_navigation(url, allowed_origin.as_ref(), recovery_visible)
        })
        .build()
}

pub(crate) fn set_allowed_loopback_origin(app: &AppHandle, url: &Url) {
    let Some(host) = url.host_str() else {
        return;
    };
    let Some(port) = url.port_or_known_default() else {
        return;
    };
    if let Ok(mut slot) = app.state::<RuntimeProcess>().allowed_origin.lock() {
        *slot = Some((host.to_string(), port));
    }
}

pub(crate) fn clear_allowed_loopback_origin(app: &AppHandle) {
    if let Some(state) = app.try_state::<RuntimeProcess>() {
        if let Ok(mut slot) = state.allowed_origin.lock() {
            *slot = None;
        }
    }
}

pub(crate) fn is_local_host(host: &str) -> bool {
    let normalized = host.trim_end_matches('.').to_ascii_lowercase();
    normalized == "localhost"
        || normalized.ends_with(".localhost")
        || normalized == "0.0.0.0"
        || normalized == "::1"
        || normalized == "[::1]"
        || normalized.starts_with("127.")
}

pub(crate) fn is_allowed_main_navigation(
    url: &Url,
    allowed_origin: Option<&(String, u16)>,
    recovery_visible: bool,
) -> bool {
    if url.as_str() == "about:blank" {
        return true;
    }
    let is_tauri_origin = (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost"));
    if is_tauri_origin {
        return true;
    }
    if recovery_visible {
        return false;
    }
    let Some((host, port)) = allowed_origin else {
        return false;
    };
    url.scheme() == "http"
        && url.host_str() == Some(host.as_str())
        && url.port_or_known_default() == Some(*port)
}

pub(crate) fn is_allowed_preview_frame_navigation(uri: &str) -> bool {
    uri == "about:srcdoc"
}

pub(crate) fn is_blocked_subframe_navigation(uri: &str) -> bool {
    if uri == "about:srcdoc" || uri == "about:blank" {
        return false;
    }
    let Ok(parsed) = Url::parse(uri) else {
        return true;
    };
    match parsed.scheme() {
        "http" | "https" => parsed.host_str().is_none_or(is_local_host),
        _ => true,
    }
}

#[cfg(windows)]
pub(crate) fn install_webview_isolation(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main desktop window is unavailable".to_string())?;
    window
        .with_webview(|platform| {
            let controller = platform.controller();
            unsafe {
                let webview = controller
                    .CoreWebView2()
                    .expect("WebView2 controller should expose CoreWebView2");
                if let Ok(settings) = webview.Settings() {
                    let _ = settings.SetAreHostObjectsAllowed(false);
                }

                let mut new_window_token = 0i64;
                let _ = webview.add_NewWindowRequested(
                    &webview2_com::NewWindowRequestedEventHandler::create(Box::new(|_, args| {
                        if let Some(args) = args {
                            args.SetHandled(true)?;
                        }
                        Ok(())
                    })),
                    &mut new_window_token,
                );

                let mut frame_nav_token = 0i64;
                let _ = webview.add_FrameNavigationStarting(
                    &webview2_com::NavigationStartingEventHandler::create(Box::new(|_, args| {
                        let Some(args) = args else {
                            return Ok(());
                        };
                        let mut raw_uri = windows_core::PWSTR::null();
                        args.Uri(&mut raw_uri)?;
                        let uri = webview2_com::take_pwstr(raw_uri);
                        if is_blocked_subframe_navigation(&uri) {
                            args.SetCancel(true)?;
                        }
                        Ok(())
                    })),
                    &mut frame_nav_token,
                );

                if let Ok(webview4) = windows_core::Interface::cast::<
                    webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_4,
                >(&webview)
                {
                    let mut frame_created_token = 0i64;
                    let _ = webview4.add_FrameCreated(
                        &webview2_com::FrameCreatedEventHandler::create(Box::new(|_, args| {
                            let Some(args) = args else {
                                return Ok(());
                            };
                            let frame = args.Frame()?;
                            let mut raw_name = windows_core::PWSTR::null();
                            let name = frame
                                .Name(&mut raw_name)
                                .map(|()| webview2_com::take_pwstr(raw_name))
                                .unwrap_or_default();
                            if name == PREVIEW_HOST_FRAME_NAME {
                                lock_preview_frame(&frame, false, false);
                            } else if name == PREVIEW_CONTENT_FRAME_NAME {
                                lock_preview_frame(&frame, true, false);
                            }
                            Ok(())
                        })),
                        &mut frame_created_token,
                    );
                }
            }
        })
        .map_err(|error| format!("attach WebView2 preview isolation: {error}"))
}

#[cfg(windows)]
fn lock_preview_frame(
    frame: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Frame,
    is_content_frame: bool,
    deny_all_navigations: bool,
) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2Frame2, ICoreWebView2Frame7};
    use webview2_com::{
        take_pwstr, FrameChildFrameCreatedEventHandler, FrameNavigationStartingEventHandler,
    };
    use windows_core::{Interface, PWSTR};

    unsafe {
        if let Ok(frame2) = frame.cast::<ICoreWebView2Frame2>() {
            let mut nav_token = 0i64;
            let _ = frame2.add_NavigationStarting(
                &FrameNavigationStartingEventHandler::create(Box::new(move |_, args| {
                    let Some(args) = args else {
                        return Ok(());
                    };
                    let mut raw_uri = PWSTR::null();
                    args.Uri(&mut raw_uri)?;
                    let uri = take_pwstr(raw_uri);
                    if deny_all_navigations || !is_allowed_preview_frame_navigation(&uri) {
                        args.SetCancel(true)?;
                    }
                    Ok(())
                })),
                &mut nav_token,
            );
        }

        if let Ok(frame7) = frame.cast::<ICoreWebView2Frame7>() {
            let mut child_token = 0i64;
            let _ = frame7.add_FrameCreated(
                &FrameChildFrameCreatedEventHandler::create(Box::new(move |_, args| {
                    let Some(args) = args else {
                        return Ok(());
                    };
                    if let Ok(child) = args.Frame() {
                        // Only the direct sandboxed content iframe inside the outer
                        // host wrapper may load its initial about:srcdoc document.
                        // Any child frame inside the content frame is denied all URLs.
                        let (child_is_content, child_deny_all) =
                            if is_content_frame || deny_all_navigations {
                                (true, true)
                            } else {
                                let mut raw_name = PWSTR::null();
                                let child_name = child
                                    .Name(&mut raw_name)
                                    .map(|()| take_pwstr(raw_name))
                                    .unwrap_or_default();
                                (true, child_name != PREVIEW_CONTENT_FRAME_NAME)
                            };
                        lock_preview_frame(&child, child_is_content, child_deny_all);
                    }
                    Ok(())
                })),
                &mut child_token,
            );
        }
    }
}

#[cfg(not(windows))]
pub(crate) fn install_webview_isolation(_app: &AppHandle) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        is_allowed_main_navigation, is_allowed_preview_frame_navigation,
        is_blocked_subframe_navigation,
    };
    use tauri::Url;

    #[test]
    fn allows_only_bootstrap_or_pinned_loopback_origin_on_main_navigation() {
        let pinned = ("127.0.0.1".to_string(), 49152u16);
        assert!(is_allowed_main_navigation(
            &Url::parse("about:blank").unwrap(),
            None,
            false,
        ));
        assert!(is_allowed_main_navigation(
            &Url::parse("tauri://localhost/index.html").unwrap(),
            None,
            false,
        ));
        assert!(is_allowed_main_navigation(
            &Url::parse("http://tauri.localhost/index.html").unwrap(),
            None,
            false,
        ));
        assert!(is_allowed_main_navigation(
            &Url::parse("http://127.0.0.1:49152/workspace/abc").unwrap(),
            Some(&pinned),
            false,
        ));
        assert!(!is_allowed_main_navigation(
            &Url::parse("http://127.0.0.1:49152/").unwrap(),
            Some(&pinned),
            true,
        ));
        assert!(!is_allowed_main_navigation(
            &Url::parse("http://127.0.0.1:49999/").unwrap(),
            Some(&pinned),
            false,
        ));
        assert!(!is_allowed_main_navigation(
            &Url::parse("https://evil.example/").unwrap(),
            Some(&pinned),
            false,
        ));
        assert!(!is_allowed_main_navigation(
            &Url::parse("data:text/html,hi").unwrap(),
            Some(&pinned),
            false,
        ));
    }

    #[test]
    fn restricts_preview_frames_strictly_to_about_srcdoc() {
        assert!(is_allowed_preview_frame_navigation("about:srcdoc"));
        for blocked in [
            "about:blank",
            "https://example.com/",
            "http://127.0.0.1:8080/api/health",
            "data:text/html,<script>alert(1)</script>",
            "blob:null/1234",
            "javascript:alert(1)",
            "file:///C:/Windows/win.ini",
        ] {
            assert!(
                !is_allowed_preview_frame_navigation(blocked),
                "{blocked} must be blocked in preview frame"
            );
        }
    }

    #[test]
    fn blocks_local_and_dangerous_subframe_targets_while_preserving_https_embeds() {
        assert!(!is_blocked_subframe_navigation("https://howlil.tech/embed"));
        assert!(!is_blocked_subframe_navigation("about:srcdoc"));
        assert!(!is_blocked_subframe_navigation("about:blank"));
        for blocked in [
            "http://127.0.0.1:8080/",
            "http://localhost:8080/api/workspaces",
            "http://ipc.localhost/plugin",
            "https://tauri.localhost/index.html",
            "http://[::1]:8080/",
            "tauri://localhost/index.html",
            "data:text/html,<p>x</p>",
            "blob:http://127.0.0.1:8080/uuid",
            "javascript:alert(1)",
            "file:///etc/passwd",
        ] {
            assert!(
                is_blocked_subframe_navigation(blocked),
                "{blocked} must be blocked in subframes"
            );
        }
    }
}
