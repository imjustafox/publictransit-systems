import { notFound, permanentRedirect } from "next/navigation";
import {
  getAllSystems,
  getStations,
  getStationCanonicalNetworkId,
  getStationNetworkIds,
  getNetwork,
  getStation,
} from "@/lib/data";
import { StationDetailContent } from "@/app/[system]/stations/[station]/StationDetailContent";

interface PageProps {
  params: Promise<{ system: string; network: string; station: string }>;
}

export async function generateStaticParams() {
  const systems = await getAllSystems();
  const params: Array<{ system: string; network: string; station: string }> = [];

  for (const system of systems) {
    if (!system.networks?.length) continue;
    const stations = await getStations(system.id);
    for (const station of stations) {
      const networkId = await getStationCanonicalNetworkId(system.id, station);
      if (networkId) {
        params.push({ system: system.id, network: networkId, station: station.id });
      }
    }
  }

  return params;
}

export default async function NetworkStationDetailPage({ params }: PageProps) {
  const { system: systemId, network: networkId, station: stationId } = await params;

  // Decode station ID if it's URL-encoded
  const decodedStationId = decodeURIComponent(stationId);

  const [network, station] = await Promise.all([
    getNetwork(systemId, networkId),
    getStation(systemId, decodedStationId),
  ]).catch(() => notFound());

  if (!network || !station) {
    notFound();
  }

  // The station must be served by at least one line of this network.
  const stationNetworkIds = await getStationNetworkIds(systemId, station);
  if (!stationNetworkIds.includes(network.id)) {
    notFound();
  }

  // One canonical URL per station: other serving networks redirect to it.
  const canonical = await getStationCanonicalNetworkId(systemId, station);
  if (canonical && canonical !== network.id) {
    permanentRedirect(`/${systemId}/${canonical}/stations/${station.id}`);
  }

  return (
    <StationDetailContent systemId={systemId} stationId={decodedStationId} network={network} />
  );
}
