import { PaymentFeatures } from "../src/components/payment-methods/payment-features";
// Minimal DOM for the helper's owned controls; provider iframe/Utility behavior is not mocked as a browser test.
class ElementStub {
  children: any[] = [];
  style = { display: "" };
  parentElement?: ElementStub;
  type = "";
  name = "";
  value = "";
  checked = false;
  disabled = false;
  required = true;
  textContent = "";
  handlers: Record<string, () => void> = {};
  append(...nodes: any[]) {
    this.children.push(...nodes);
    for (const node of nodes)
      if (typeof node === "object") node.parentElement = this;
  }
  appendChild(node: any) {
    this.append(node);
    return node;
  }
  prepend(node: any) {
    this.children.unshift(node);
    node.parentElement = this;
  }
  after(node: any) {
    this.parentElement?.append(node);
  }
  addEventListener(type: string, fn: () => void) {
    this.handlers[type] = fn;
  }
  all(): any[] {
    return this.children.flatMap((node) =>
      typeof node === "object" ? [node, ...node.all()] : [],
    );
  }
  querySelector(selector: string): any {
    return selector === "input:checked"
      ? this.all().find((node) => node.type === "radio" && node.checked)
      : undefined;
  }
}
let fields: Record<string, ElementStub>;
let container: ElementStub;
let reply: any;
beforeEach(() => {
  container = new ElementStub();
  fields = {};
  for (const name of ["#bank", "#dob"]) {
    const field = new ElementStub();
    container.append(field);
    const input = new ElementStub();
    field.append(input);
    fields[name] = name === "#dob" ? input : field;
  }
  container.querySelector = (selector) => fields[selector];
  (globalThis as any).document = {
    createElement: () => new ElementStub(),
    createTextNode: (text: string) => text,
  };
  (globalThis as any).fetch = jest.fn(async () => ({
    ok: true,
    json: async () => reply,
  }));
});
const mount = (helper: PaymentFeatures, locale: "en" | "de" = "en") =>
  helper.mount({
    container: container as any,
    processorUrl: "https://processor.example",
    sessionId: "session",
    type: "GUARANTEED_DIRECT_DEBIT_SEPA",
    locale,
    fields: ["#bank"],
    dob: "#dob",
  });
test("disabled one-click creates no consent controls; B2B only hides DOB when server confirms it", async () => {
  reply = { oneClick: false, business: false, savedPayments: [] };
  const h = new PaymentFeatures();
  await mount(h);
  expect(h.business).toBe(false);
  expect(fields["#dob"].disabled).toBe(false);
  expect(container.all().filter((x) => x.type === "checkbox")).toHaveLength(0);
  reply.business = true;
  await mount(new PaymentFeatures());
  expect(fields["#dob"].disabled).toBe(true);
  expect(fields["#dob"].parentElement!.style.display).toBe("none");
});
test("consent starts unchecked and sends create request only after deliberate selection", async () => {
  reply = { oneClick: true, business: false, savedPayments: [] };
  const h = new PaymentFeatures();
  await mount(h, "de");
  expect(h.paymentFields).toEqual({});
  const check = container.all().find((x) => x.type === "checkbox");
  check.checked = true;
  expect(h.paymentFields).toEqual({ savePayment: true });
  expect(check.parentElement.children).toContain(
    " Speichern für zukünftige Einkäufe",
  );
});
test("latest three saved options plus new details; selecting new toggles fields and consent", async () => {
  reply = {
    oneClick: true,
    business: false,
    savedPayments: Array.from({ length: 4 }, (_, i) => ({
      id: "id" + i,
      label: "IBAN •••• 123" + i,
    })),
  };
  const h = new PaymentFeatures();
  await mount(h);
  const radios = container.all().filter((x) => x.type === "radio");
  expect(radios).toHaveLength(4);
  expect(h.paymentFields).toEqual({ savedPaymentId: "id0" });
  expect(fields["#bank"].style.display).toBe("none");
  radios.forEach((x) => (x.checked = false));
  radios[3].checked = true;
  radios[3].handlers.change();
  expect(h.paymentFields).toEqual({});
  expect(fields["#bank"].style.display).toBe("");
  const check = container.all().find((x) => x.type === "checkbox");
  expect(check.parentElement.style.display).toBe("block");
  check.checked = true;
  radios[3].checked = false;
  radios[1].checked = true;
  radios[1].handlers.change();
  expect(check.checked).toBe(false);
  expect(h.paymentFields).toEqual({ savedPaymentId: "id1" });
});
test("request uses active Session and response labels are inserted as text", async () => {
  reply = {
    oneClick: true,
    business: false,
    savedPayments: [{ id: "id", label: "<img src=x onerror=alert(1)>" }],
  };
  await mount(new PaymentFeatures());
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining(
      "/paymentFeatures?paymentMethod=GUARANTEED_DIRECT_DEBIT_SEPA",
    ),
    { headers: { "X-Session-Id": "session" }, cache: "no-store" },
  );
  expect(
    container
      .all()
      .some((x) => x.children.includes(" <img src=x onerror=alert(1)>")),
  ).toBe(true);
});
test("settings failure is not treated as permission to save or skip DOB", async () => {
  (fetch as jest.Mock).mockResolvedValueOnce({ ok: false });
  const h = new PaymentFeatures();
  await expect(mount(h)).rejects.toThrow();
  expect(h.paymentFields).toEqual({});
  expect(h.business).toBe(false);
});
