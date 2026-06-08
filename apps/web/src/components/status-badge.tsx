export function StatusBadge({ status }: { status: string }) {
  const style = readStatusStyle(status);

  return (
    <span
      className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${style}`}
    >
      {status}
    </span>
  );
}

function readStatusStyle(status: string) {
  if (status === "CONNECTED") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === "QR_READY" || status === "CONNECTING") {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-red-100 text-red-700";
}
