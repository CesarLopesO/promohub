import {
  CredentialTutorialContent,
  type CredentialTutorialSettings,
  type TutorialMarketplace,
} from "./credential-tutorial-link";

export function UpcomingMarketplaceCard({
  label,
  marketplace,
  tutorialSettings,
}: {
  label: string;
  marketplace: TutorialMarketplace;
  tutorialSettings: CredentialTutorialSettings;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-700">{label}</h3>
        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
          Em breve
        </span>
      </div>
      <label className="mt-5 block text-sm font-medium text-slate-500">
        Credencial de afiliado
        <input
          className="mt-1 h-10 w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-100 px-3 text-sm text-slate-400"
          disabled
          placeholder="Em breve"
          readOnly
          type="text"
        />
      </label>
      <CredentialTutorialContent
        marketplace={marketplace}
        settings={tutorialSettings}
      />
    </article>
  );
}
