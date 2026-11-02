type Features = {
  business: boolean;
  oneClick: boolean;
  savedPayments: Array<{ id: string; label: string }>;
};
type FeatureOptions = {
  container: Element;
  processorUrl: string;
  sessionId: string;
  type: string;
  locale: "en" | "de";
  fields: string[];
  dob?: string;
  onSelectionChange?: (saved: boolean) => void;
};
const text = {
  en: {
    save: "Save for future purchase",
    card: "Add new card details",
    account: "Add new account details",
    accountNumber: "Account Number",
    delete: "Delete saved payment",
    deleteError: "Unable to delete saved payment. Please try again.",
  },
  de: {
    save: "Speichern für zukünftige Einkäufe",
    card: "Neue Kreditkarte hinzufügen",
    account: "Neue Kontodaten hinzufügen",
    accountNumber: "Kontonummer",
    delete: "Gespeicherte Zahlungsdaten löschen",
    deleteError: "Die gespeicherten Zahlungsdaten konnten nicht gelöscht werden. Bitte versuchen Sie es erneut.",
  },
};
export class PaymentFeatures {
  private radios?: HTMLFieldSetElement;
  private checkbox?: HTMLInputElement;
  private newFields: Array<{ element: HTMLElement; display: string }> = [];
  private saveLabel?: HTMLLabelElement;
  private deleteError?: HTMLElement;
  public business = false;
  private businessOptions?: FeatureOptions;
  private businessRequest?: Promise<void>;
  private businessObserver?: IntersectionObserver;
  private businessListener?: () => void;
  private dobState?: {
    input: HTMLInputElement;
    field: HTMLElement | null;
    display: string;
    disabled: boolean;
    required: boolean;
  };
  get savedPaymentId(): string | undefined {
    return (
      this.radios?.querySelector<HTMLInputElement>("input:checked")?.value ||
      undefined
    );
  }
  get paymentFields(): { savedPaymentId?: string; savePayment?: boolean } {
    return this.savedPaymentId
      ? { savedPaymentId: this.savedPaymentId }
      : this.checkbox?.checked
        ? { savePayment: true }
        : {};
  }
  private async loadFeatures(options: FeatureOptions): Promise<Features> {
    const response = await fetch(
      `${options.processorUrl}/paymentFeatures?paymentMethod=${encodeURIComponent(options.type)}&lang=${encodeURIComponent(options.locale)}`,
      { headers: { "X-Session-Id": options.sessionId }, cache: "no-store" },
    );
    if (!response.ok) throw new Error("Unable to load payment settings.");
    return response.json();
  }
  private applyBusiness(business: boolean): void {
    this.business = business;
    const dob = this.dobState;
    if (!dob) return;
    if (dob.field) dob.field.style.display = business ? "none" : dob.display;
    dob.input.disabled = business ? true : dob.disabled;
    dob.input.required = business ? false : dob.required;
  }
  public async refreshBusiness(): Promise<void> {
    const options = this.businessOptions;
    if (!options?.dob) return;
    if (this.businessRequest) return this.businessRequest;
    const request = this.loadFeatures(options).then((data) => {
      if (this.businessOptions === options) this.applyBusiness(data.business === true);
    });
    this.businessRequest = request;
    try {
      await request;
    } finally {
      if (this.businessRequest === request) this.businessRequest = undefined;
    }
  }
  private watchBusiness(options: FeatureOptions): void {
    if (!options.dob) return;
    const refresh = () => { void this.refreshBusiness().catch(() => {}); };
    this.businessListener = refresh;
    options.container.addEventListener("focusin", refresh);
    options.container.addEventListener("pointerenter", refresh);
    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver((entries) => {
        if (!options.container.isConnected) {
          observer.disconnect();
          return;
        }
        if (entries.some((entry) => entry.isIntersecting)) refresh();
      });
      observer.observe(options.container);
      this.businessObserver = observer;
    }
  }
  async mount(options: FeatureOptions): Promise<void> {
    this.businessObserver?.disconnect();
    if (this.businessOptions && this.businessListener) {
      this.businessOptions.container.removeEventListener("focusin", this.businessListener);
      this.businessOptions.container.removeEventListener("pointerenter", this.businessListener);
    }
    this.businessOptions = options;
    this.businessRequest = undefined;
    const input = options.dob
      ? options.container.querySelector<HTMLInputElement>(options.dob) : null;
    this.dobState = input ? this.dobState?.input === input ? this.dobState : {
      input, field: input.parentElement, display: input.parentElement?.style.display ?? "",
      disabled: input.disabled, required: input.required,
    } : undefined;
    const data = await this.loadFeatures(options);
    if (this.businessOptions !== options) return;
    this.applyBusiness(data.business === true);
    this.watchBusiness(options);
    if (!data.oneClick) return;
    const dictionary = text[options.locale];
    this.newFields = options.fields
      .map((selector) => options.container.querySelector<HTMLElement>(selector))
      .filter((element): element is HTMLElement => Boolean(element))
      .map((element) => ({ element, display: element.style.display }));
    const payments = Array.isArray(data.savedPayments)
      ? data.savedPayments.slice(0, 3)
      : [];
    if (payments.length) {
      await this.waitForNativePaymentRadio();
      if (this.businessOptions !== options) return;

      this.radios = this.renderSavedPayments(options, payments, dictionary);
      options.container.prepend(this.radios);
    }
    this.saveLabel = document.createElement("label");
    this.saveLabel.style.display = "block";
    this.checkbox = document.createElement("input");
    this.checkbox.type = "checkbox";
    this.checkbox.checked = false;
    this.saveLabel.append(
      this.checkbox,
      document.createTextNode(` ${dictionary.save}`),
    );
    const last = this.newFields[this.newFields.length - 1]?.element;
    if (last) last.after(this.saveLabel);
    else options.container.appendChild(this.saveLabel);
    this.toggle();
  }
  
  private async waitForNativePaymentRadio(timeoutMs = 3000): Promise<void> {
    const selector = 'input[name="payment-selector-list"]';
    if (document.querySelector<HTMLInputElement>(selector)) return;
  
    await new Promise<void>((resolve) => {
      let finished = false;
      const observer = new MutationObserver(() => {
        if (document.querySelector<HTMLInputElement>(selector)) finish();
      });
  
      let timer: number | undefined;
  
      const finish = () => {
        if (finished) return;
        finished = true;
        if (timer !== undefined) window.clearTimeout(timer);
        observer.disconnect();
        resolve();
      };
  
      timer = window.setTimeout(finish, timeoutMs);
  
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
  
      if (document.querySelector<HTMLInputElement>(selector)) finish();
    });
  }

  private renderSavedPayments(
    options: FeatureOptions,
    payments: Array<{ id: string; label: string }>,
    dictionary: typeof text["en"] | typeof text["de"],
    selectedId?: string,
  ): HTMLFieldSetElement {
    const fieldset = document.createElement("fieldset");
    fieldset.style.border = "0";
    fieldset.style.padding = "0";

    const templateRadio = document.querySelector<HTMLInputElement>(
      'input[name="payment-selector-list"]',
    );
    const templateLabel = templateRadio?.closest("label");

    [
      ...payments,
      {
        id: "",
        label:
          options.type === "CREDITCARD"
            ? dictionary.card
            : dictionary.account,
      },
    ].forEach((payment, index) => {
      let label: HTMLLabelElement;
      let radio: HTMLInputElement;

      if (templateLabel) {
        label = templateLabel.cloneNode(true) as HTMLLabelElement;
        label.removeAttribute("for");

        const clonedRadio = label.querySelector<HTMLInputElement>('input[type="radio"]');
        if (!clonedRadio) {
          throw new Error("Unable to reuse the commercetools payment radio markup.");
        }

        radio = clonedRadio;
        radio.id = "";
        radio.name = `nn_saved_${options.type}`;
        radio.value = payment.id;
        radio.checked = payment.id
          ? payment.id === (selectedId ?? payments[0]?.id)
          : !selectedId && !payments.length;

        label.querySelectorAll<HTMLElement>("[id]").forEach((element) => {
          if (element !== radio) element.removeAttribute("id");
        });

        const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
        const textNodes: Text[] = [];
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if (node.textContent?.trim()) textNodes.push(node as Text);
        }
        if (textNodes.length) {
          textNodes[0].textContent = payment.label;
          for (const textNode of textNodes.slice(1)) textNode.textContent = "";
        } else {
          label.appendChild(document.createTextNode(payment.label));
        }
      } else {
        label = document.createElement("label");
        label.style.display = "block";
        radio = document.createElement("input");
        radio.type = "radio";
        radio.name = `nn_saved_${options.type}`;
        radio.value = payment.id;
        radio.checked = selectedId
          ? payment.id === selectedId
          : index === 0;
        label.append(radio, document.createTextNode(` ${payment.label}`));
      }

      radio.addEventListener("change", () => this.toggle());

      if (!payment.id) {
        fieldset.appendChild(label);
        return;
      }

      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.justifyContent = "flex-start";

      const remove = document.createElement("button");
      remove.type = "button";
      remove.title = dictionary.delete;
      remove.setAttribute("aria-label", `${dictionary.delete}: ${payment.label}`);
      remove.style.cssText =
        "border:0;background:transparent;cursor:pointer;padding:4px;color:inherit;width:auto;flex:0 0 auto;margin:0;display:inline-flex;align-items:center;";
      remove.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';

      remove.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (remove.disabled) return;
        remove.disabled = true;
        this.deleteError?.remove();
        this.deleteError = undefined;

        const selectedBeforeDelete = this.savedPaymentId;

        try {
          const result = await fetch(`${options.processorUrl}/deleteSavedPayment`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Session-Id": options.sessionId,
            },
            body: JSON.stringify({
              paymentMethod: options.type,
              savedPaymentId: payment.id,
            }),
          });
          if (!result.ok) throw new Error("Saved payment deletion failed.");

          const refreshed = await this.loadFeatures(options);
          const refreshedPayments = Array.isArray(refreshed.savedPayments)
            ? refreshed.savedPayments.slice(0, 3)
            : [];

          if (refreshedPayments.length) {
            const nextSelectedId =
              selectedBeforeDelete && selectedBeforeDelete !== payment.id &&
              refreshedPayments.some((item) => item.id === selectedBeforeDelete)
                ? selectedBeforeDelete
                : refreshedPayments[0].id;

            const replacement = this.renderSavedPayments(
              options,
              refreshedPayments,
              dictionary,
              nextSelectedId,
            );
            this.radios?.replaceWith(replacement);
            this.radios = replacement;
          } else {
            this.radios?.remove();
            this.radios = undefined;
          }

          this.toggle();
        } catch {
          remove.disabled = false;
          this.deleteError = document.createElement("p");
          this.deleteError.setAttribute("role", "alert");
          this.deleteError.textContent = dictionary.deleteError;
          this.radios?.appendChild(this.deleteError);
        }
      });

      row.append(label, remove);
      fieldset.appendChild(row);
    });

    return fieldset;
  }
  private toggle(): void {
    const saved = Boolean(this.savedPaymentId);
    for (const field of this.newFields)
      field.element.style.display = saved ? "none" : field.display;
    if (this.saveLabel) this.saveLabel.style.display = saved ? "none" : "block";
    if (saved && this.checkbox) this.checkbox.checked = false;
    this.businessOptions?.onSelectionChange?.(saved);
  }
}
