export type BillingPaymentMethod = "FLEXIBLE" | "CREDIT_CARD_RECURRING";

type BillingPaymentMethodSelectorProps = {
  value: BillingPaymentMethod;
  onChange: (value: BillingPaymentMethod) => void;
};

const OPTIONS: Array<{
  value: BillingPaymentMethod;
  label: string;
  description: string;
}> = [
  {
    value: "FLEXIBLE",
    label: "Pix, boleto ou cartão",
    description: "Escolha a forma de pagamento no checkout Asaas.",
  },
  {
    value: "CREDIT_CARD_RECURRING",
    label: "Cartão recorrente",
    description:
      "No cartão recorrente, sua assinatura renova automaticamente a cada mês.",
  },
];

export function BillingPaymentMethodSelector({
  value,
  onChange,
}: BillingPaymentMethodSelectorProps) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-950">
        Forma de pagamento
      </legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((option) => (
          <label
            className={`block cursor-pointer rounded-md border p-4 ${
              value === option.value
                ? "border-slate-950 bg-slate-50"
                : "border-slate-200 bg-white"
            }`}
            key={option.value}
          >
            <span className="flex items-start gap-3">
              <input
                checked={value === option.value}
                className="mt-1 h-4 w-4 accent-slate-950"
                name="billing-payment-method"
                onChange={() => onChange(option.value)}
                type="radio"
                value={option.value}
              />
              <span>
                <span className="block text-sm font-medium text-slate-950">
                  {option.label}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {option.description}
                </span>
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
