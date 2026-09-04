import { notFound } from "next/navigation";
import { getAllSystems, getLines, getNetwork, getLine } from "@/lib/data";
import { LineDetailContent } from "@/app/[system]/lines/[line]/LineDetailContent";

interface PageProps {
  params: Promise<{ system: string; network: string; line: string }>;
}

export async function generateStaticParams() {
  const systems = await getAllSystems();
  const params: Array<{ system: string; network: string; line: string }> = [];

  for (const system of systems) {
    if (!system.networks?.length) continue;
    const lines = await getLines(system.id);
    for (const line of lines) {
      if (line.network) {
        params.push({ system: system.id, network: line.network, line: line.id });
      }
    }
  }

  return params;
}

export default async function NetworkLineDetailPage({ params }: PageProps) {
  const { system: systemId, network: networkId, line: lineId } = await params;

  // Decode line ID if it's URL-encoded
  const decodedLineId = decodeURIComponent(lineId);

  const [network, line] = await Promise.all([
    getNetwork(systemId, networkId),
    getLine(systemId, decodedLineId),
  ]).catch(() => notFound());

  // The line must belong to this declared network.
  if (!network || !line || line.network !== network.id) {
    notFound();
  }

  return <LineDetailContent systemId={systemId} lineId={decodedLineId} network={network} />;
}
