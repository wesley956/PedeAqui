import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const component = fs.readFileSync(path.join(root, "src/components/ui/form-controls.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src/components/ui/form-controls.module.css"), "utf8");

describe("PedeAqui form control system", () => {
  it("exports the canonical field controls", () => {
    for (const name of ["Input", "Textarea", "SelectField", "Checkbox", "Radio", "Switch", "SearchInput", "MoneyInput", "PhoneInput", "AddressInput", "QuantityInput"]) {
      expect(component).toContain(`function ${name}`);
    }
  });

  it("covers validation, help, required, loading and disabled semantics", () => {
    expect(component).toContain("aria-invalid");
    expect(component).toContain("aria-describedby");
    expect(component).toContain("aria-busy");
    expect(component).toContain("Obrigatório");
    expect(component).toContain("disabled={disabled || loading}");
    expect(component).toContain('role="alert"');
  });

  it("uses semantic and structural tokens instead of hardcoded visual colors", () => {
    expect(css).toContain("var(--control-height)");
    expect(css).toContain("var(--focus-ring)");
    expect(css).toContain("var(--state-danger)");
    expect(css).toContain("@media (pointer: coarse)");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it("keeps legacy Input and Select imports routed through the canonical system", () => {
    const input = fs.readFileSync(path.join(root, "src/components/ui/input.tsx"), "utf8");
    const primitives = fs.readFileSync(path.join(root, "src/components/ui/primitives.tsx"), "utf8");
    expect(input).toContain('from "./form-controls"');
    expect(primitives).toContain('SelectField as Select');
  });
});
