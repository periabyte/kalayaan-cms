// cms.plugins.ts
var plugins = [
  {
    name: "color",
    fieldTypes: {
      // A hex-color validator wired into fields declared `field.custom("hex")`.
      // Runs in the write path; its return value is what gets stored.
      hex(value) {
        const s = String(value ?? "").trim();
        if (!/^#[0-9a-fA-F]{6}$/.test(s)) throw new Error("expected a hex color like #1a2b3c");
        return s.toUpperCase();
      }
    }
  }
];
var cms_plugins_default = plugins;
export {
  cms_plugins_default as default
};
