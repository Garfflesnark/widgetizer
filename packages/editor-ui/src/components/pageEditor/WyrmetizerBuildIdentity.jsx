import usePageStore from "../../stores/pageStore";
import { getWyrmetizerLayoutIdentity, getWyrmetizerRuntimeIdentity } from "../../lib/wyrmetizerBuildIdentity";

const fullCommit = typeof __WYRMETIZER_BUILD_COMMIT__ === "string" ? __WYRMETIZER_BUILD_COMMIT__ : "unknown";
const shortCommit = /^[0-9a-f]{40}$/i.test(fullCommit) ? fullCommit.slice(0, 7) : "unknown";
const runtime = getWyrmetizerRuntimeIdentity({ dev: import.meta.env.DEV, hostname: window.location.hostname });

export default function WyrmetizerBuildIdentity({ presentation }) {
  const page = usePageStore((state) => state.page);
  const layout = getWyrmetizerLayoutIdentity(page);
  const mode = presentation === "mobile" ? "Mobile" : presentation === "desktop" ? "Desktop" : "Unknown";
  const localLabel = runtime.isLocalDevelopment ? "Local dev" : "Not local dev";

  return (
    <details className="relative shrink-0">
      <summary
        aria-label={`Wyrmetizer identity: ${layout.label}, ${mode}, ${localLabel}, commit ${shortCommit}`}
        title="Wyrmetizer development identity"
        className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded border border-slate-300 bg-slate-50 px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 [&::-webkit-details-marker]:hidden"
        data-testid="wyrmetizer-identity-summary"
      >
        <span className="text-pink-700">Wyrmetizer</span>
        <span>{layout.label}</span>
        <span className="text-slate-400">·</span>
        <span>{mode}</span>
        <span className="text-slate-400">·</span>
        <span>{runtime.isLocalDevelopment ? "DEV" : shortCommit}</span>
      </summary>
      <div
        className="absolute right-0 top-full z-[60] mt-1 w-72 rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-xl"
        data-testid="wyrmetizer-identity-details"
      >
        <p className="mb-2 font-semibold text-slate-900">Wyrmetizer development identity</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
          <dt className="text-slate-500">Frontend commit</dt><dd className="break-all font-mono">{fullCommit}</dd>
          <dt className="text-slate-500">Short commit</dt><dd className="font-mono">{shortCommit}</dd>
          <dt className="text-slate-500">Build mode</dt><dd>{runtime.buildMode}</dd>
          <dt className="text-slate-500">Local development</dt><dd>{runtime.isLocalDevelopment ? "Yes" : "No"}</dd>
          <dt className="text-slate-500">Page layout</dt><dd>{layout.detail}</dd>
          <dt className="text-slate-500">Presentation</dt><dd>{mode}</dd>
        </dl>
      </div>
    </details>
  );
}
