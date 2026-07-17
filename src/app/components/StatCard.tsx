export function StatCard({
  label,
  value,
  note
}: {
  label: string;
  value: string | number;
  note: string;
}) {
  return (
    <section className="statCard">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
    </section>
  );
}
