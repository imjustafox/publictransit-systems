import { StationsListContent } from "./StationsListContent";

interface PageProps {
  params: Promise<{ system: string }>;
  searchParams: Promise<{ status?: string; line?: string }>;
}

export default async function StationsPage({ params, searchParams }: PageProps) {
  const { system: systemId } = await params;
  const { status, line } = await searchParams;

  return <StationsListContent systemId={systemId} status={status} line={line} />;
}
