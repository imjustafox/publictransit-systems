import { notFound, permanentRedirect } from "next/navigation";
import { getSystem, getStation, getStationCanonicalNetworkId } from "@/lib/data";
import { StationDetailContent } from "./StationDetailContent";

interface PageProps {
  params: Promise<{ system: string; station: string }>;
}

export default async function StationDetailPage({ params }: PageProps) {
  const { system: systemId, station: stationId } = await params;

  // Decode station ID if it's URL-encoded
  const decodedStationId = decodeURIComponent(stationId);

  const [system, station] = await Promise.all([
    getSystem(systemId),
    getStation(systemId, decodedStationId),
  ]).catch(() => notFound());

  if (!station) {
    notFound();
  }

  // Networked systems canonicalize station URLs under the first line's network.
  if (system.networks?.length) {
    const networkId = await getStationCanonicalNetworkId(systemId, station);
    if (networkId) {
      permanentRedirect(`/${systemId}/${networkId}/stations/${station.id}`);
    }
  }

  return <StationDetailContent systemId={systemId} stationId={decodedStationId} />;
}
