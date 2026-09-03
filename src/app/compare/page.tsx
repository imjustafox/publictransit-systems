import { getAllSystems } from "@/lib/data";
import { CompareView } from "@/components/compare/CompareView";

export default async function ComparePage() {
  const systems = await getAllSystems();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-mono font-bold text-text-primary">Compare Systems</h1>
        <p className="text-text-secondary">
          Compare statistics and features across different transit systems
        </p>
      </div>

      <CompareView systems={systems} />
    </div>
  );
}
