import { Link } from "@tanstack/react-router";
import { LayoutGrid, PanelLeftClose, PanelLeftOpen, Tag } from "lucide-react";
import type { CategorySummary } from "../domain/project/project";

export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        n<span>·</span>
      </span>
      notespace<span className="brand-dot">.</span>
    </span>
  );
}

export function Sidebar({
  categories,
  collapsed,
  onToggle,
}: {
  categories: CategorySummary[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside className={collapsed ? "sidebar is-collapsed" : "sidebar"}>
      <Link to="/" className="brand-link" aria-label="Notespace home">
        <Brand />
      </Link>
      <button className="sidebar-toggle icon-button" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
      </button>
      <nav aria-label="Main navigation">
        <Link to="/" className="nav-item active">
          <LayoutGrid size={17} />
          {!collapsed && <>All categories <span className="count">{categories.length}</span></>}
        </Link>
      </nav>
      {!collapsed && <>
        <div className="sidebar-section">CATEGORIES</div>
        <nav aria-label="Categories" className="recent-nav">
          {categories.map((category) => (
            <a className="nav-item" key={category.id} href={`#category-section-${category.id}`}>
              <Tag size={15} />
              <span className="truncate">{category.title}</span>
              <span className="count">{category.workspaceCount}</span>
            </a>
          ))}
        </nav>
      </>}
    </aside>
  );
}
