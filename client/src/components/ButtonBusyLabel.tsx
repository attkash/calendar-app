const PATIENCE_HINT = 'please be patient, could take a minute';

export function ButtonBusyLabel({ status }: { status: string }) {
  return (
    <span className="flex flex-col items-center gap-0.5 leading-tight text-center">
      <span>{status}</span>
      <span className="text-[0.68rem] font-normal opacity-90 leading-snug">{PATIENCE_HINT}</span>
    </span>
  );
}
