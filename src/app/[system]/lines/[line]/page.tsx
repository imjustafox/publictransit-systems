import { notFound, permanentRedirect } from "next/navigation";
import { getSystem, getLine } from "@/lib/data";
import { LineDetailContent } from "./LineDetailContent";

interface PageProps {
  params: Promise<{ system: string; line: string }>;
}

export default async function LineDetailPage({ params }: PageProps) {
  const { system: systemId, line: lineId } = await params;

  // Decode line ID if it's URL-encoded
  const decodedLineId = decodeURIComponent(lineId);

  const [system, line] = await Promise.all([
    getSystem(systemId),
    getLine(systemId, decodedLineId),
  ]).catch(() => notFound());

  if (!line) {
    notFound();
  }

  // Networked systems canonicalize line URLs under their network.
  if (system.networks?.length && line.network) {
    permanentRedirect(`/${systemId}/${line.network}/lines/${line.id}`);
  }

  return <LineDetailContent systemId={systemId} lineId={decodedLineId} />;
}
