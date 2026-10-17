import test from "node:test";
import assert from "node:assert/strict";
import { signingConfig } from "./prepare-desktop-windows-sign-config.mjs";

const valid = {
  NOTESPACE_AZURE_SIGNING_ENDPOINT: "https://wus2.codesigning.azure.net",
  NOTESPACE_AZURE_SIGNING_ACCOUNT: "NotespacePublisher",
  NOTESPACE_AZURE_SIGNING_PROFILE: "Production",
  AZURE_CLIENT_ID: "id",
  AZURE_CLIENT_SECRET: "sensitive",
  AZURE_TENANT_ID: "tenant",
};
test("fails closed without publisher credentials", () => {
  assert.throws(() => signingConfig({}), /requires/);
  assert.throws(() => signingConfig({...valid, AZURE_CLIENT_SECRET:""}), /AZURE_CLIENT_SECRET/);
});
test("accepts only Azure signing hosts and safe arguments", () => {
  assert.throws(() => signingConfig({...valid,NOTESPACE_AZURE_SIGNING_ENDPOINT:"https://evil.example"}), /trusted/);
  assert.throws(() => signingConfig({...valid,NOTESPACE_AZURE_SIGNING_ACCOUNT:"a;exit 0"}), /shell/);
  assert.throws(() => signingConfig({...valid,NOTESPACE_AZURE_SIGNING_ENDPOINT:"http://wus2.codesigning.azure.net"}), /trusted/);
});
test("generates safe sign command without storing credentials", () => {
  const value = signingConfig(valid);
  assert.match(value.bundle.windows.signCommand,/artifact-signing-cli -e https:/);
  assert.match(value.bundle.windows.signCommand,/%1$/);
  assert.ok(!JSON.stringify(value).includes("sensitive"));
});
