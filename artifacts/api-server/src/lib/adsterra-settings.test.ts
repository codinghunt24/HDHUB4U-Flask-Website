import assert from "node:assert/strict";
import test from "node:test";
import {
  getAdminAdSettings,
  getPublicAdSettings,
} from "./adsterra-settings";

const configured = {
  adsterraEnabled: true,
  adsterraTopEnabled: true,
  adsterraTopCode: " <script>top()</script> ",
  adsterraContentEnabled: false,
  adsterraContentCode: "<script>content()</script>",
  adsterraSidebarEnabled: true,
  adsterraSidebarCode: null,
  adsterraFooterEnabled: true,
  adsterraFooterCode: "<script>footer()</script>",
};

test("keeps every public ad slot empty until ads are globally enabled", () => {
  const result = getPublicAdSettings({
    ...configured,
    adsterraEnabled: false,
  });

  assert.deepEqual(result, {
    adsterraEnabled: false,
    adsterraTopCode: null,
    adsterraContentCode: null,
    adsterraSidebarCode: null,
    adsterraFooterCode: null,
  });
});

test("publishes only configured and individually enabled placements", () => {
  const result = getPublicAdSettings(configured);

  assert.equal(result.adsterraEnabled, true);
  assert.equal(result.adsterraTopCode, "<script>top()</script>");
  assert.equal(result.adsterraContentCode, null);
  assert.equal(result.adsterraSidebarCode, null);
  assert.equal(result.adsterraFooterCode, "<script>footer()</script>");
});

test("uses safe admin defaults for existing installations", () => {
  const result = getAdminAdSettings(undefined);

  assert.equal(result.adsterraEnabled, false);
  assert.equal(result.adsterraTopEnabled, true);
  assert.equal(result.adsterraContentEnabled, true);
  assert.equal(result.adsterraSidebarEnabled, true);
  assert.equal(result.adsterraFooterEnabled, true);
});