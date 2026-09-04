import { notFound } from "next/navigation";
import { getAllSystems, getLinesByNetwork, getNetwork } from "@/lib/data";
import { StationsListContent } from "@/app/[system]/stations/StationsListContent";

interface PageProps {
  params: Promise<{ system: string; network: string }>;
  searchParams: Promise<{ status?: string; line?: string }>;
}

export async function generateStaticParams() {
  const systems = await getAllSystems();
  return systems.flatMap((system) =>
    (system.networks ?? []).map((network) => ({ system: system.id, network: network.id }))
  );
}

export default async function NetworkStationsPage({ params, searchParams }: PageProps) {
  const { system: systemId, network: networkId } = await params;
  const { status, line } = await searchParams;

  const network = await getNetwork(systemId, networkId).catch(() => notFound());

  if (!network) {
    notFound();
  }

  // All-disabled placeholder networks render nothing anywhere.
  const activeNetworkLines = await getLinesByNetwork(systemId, networkId);
  if (activeNetworkLines.length === 0) {
    notFound();
  }

  return <StationsListContent systemId={systemId} network={network} status={status} line={line} />;
}
