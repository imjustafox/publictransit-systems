import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Terminal, TerminalLine, TerminalOutput } from "@/components/ui/Terminal";
import { Badge } from "@/components/ui/Badge";
import { getAllSystems } from "@/lib/data";

interface Endpoint {
  method: "GET";
  path: string;
  description: string;
  params?: { name: string; type: string; description: string }[];
  queryParams?: { name: string; type: string; description: string }[];
  example: string;
}

const endpoints: Endpoint[] = [
  {
    method: "GET",
    path: "/api/systems",
    description: "List all available transit systems",
    example: "/api/systems",
  },
  {
    method: "GET",
    path: "/api/systems/:systemId",
    description: "Get details for a specific transit system including history",
    params: [
      {
        name: "systemId",
        type: "string",
        description: "System identifier (e.g., wmata, bart, sound-transit)",
      },
    ],
    example: "/api/systems/wmata",
  },
  {
    method: "GET",
    path: "/api/systems/:systemId/lines",
    description: "List all lines for a transit system",
    params: [{ name: "systemId", type: "string", description: "System identifier" }],
    example: "/api/systems/bart/lines",
  },
  {
    method: "GET",
    path: "/api/systems/:systemId/lines/:lineId",
    description: "Get details for a specific line including station list",
    params: [
      { name: "systemId", type: "string", description: "System identifier" },
      { name: "lineId", type: "string", description: "Line identifier (e.g., red, blue, 1-line)" },
    ],
    example: "/api/systems/wmata/lines/red",
  },
  {
    method: "GET",
    path: "/api/systems/:systemId/stations",
    description: "List all stations for a transit system with optional filters",
    params: [{ name: "systemId", type: "string", description: "System identifier" }],
    queryParams: [
      { name: "line", type: "string", description: "Filter by line ID" },
      {
        name: "status",
        type: "string",
        description: "Filter by status (active, closed, under-construction)",
      },
    ],
    example: "/api/systems/wmata/stations?line=red",
  },
  {
    method: "GET",
    path: "/api/systems/:systemId/stations/:stationId",
    description:
      "Get details for a specific station including entrances, line details, and current outages",
    params: [
      { name: "systemId", type: "string", description: "System identifier" },
      {
        name: "stationId",
        type: "string",
        description: "Station identifier (e.g., metro-center, embarcadero)",
      },
    ],
    example: "/api/systems/wmata/stations/metro-center",
  },
  {
    method: "GET",
    path: "/api/systems/:systemId/railcars",
    description: "List all railcar generations for a transit system",
    params: [{ name: "systemId", type: "string", description: "System identifier" }],
    queryParams: [
      {
        name: "status",
        type: "string",
        description: "Filter by status (active, retired, testing)",
      },
    ],
    example: "/api/systems/bart/railcars?status=active",
  },
  {
    method: "GET",
    path: "/api/systems/:systemId/railcars/:modelId",
    description: "Get details for a specific railcar model including specifications",
    params: [
      { name: "systemId", type: "string", description: "System identifier" },
      { name: "modelId", type: "string", description: "Railcar model identifier" },
    ],
    example: "/api/systems/wmata/railcars/7000-series",
  },
  {
    method: "GET",
    path: "/api/systems/:systemId/incidents",
    description: "Get current elevator/escalator outages for a system (WMATA only)",
    params: [{ name: "systemId", type: "string", description: "System identifier" }],
    example: "/api/systems/wmata/incidents",
  },
];

function EndpointCard({ endpoint }: { endpoint: Endpoint }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <Badge variant="success" className="font-mono">
            {endpoint.method}
          </Badge>
          <code className="text-accent-primary font-mono text-sm">{endpoint.path}</code>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-text-secondary">{endpoint.description}</p>

        {endpoint.params && endpoint.params.length > 0 && (
          <div>
            <h3 className="text-xs uppercase tracking-wider text-text-muted mb-2">
              Path Parameters
            </h3>
            <div className="space-y-1">
              {endpoint.params.map((param) => (
                <div key={param.name} className="flex items-start gap-2 text-sm">
                  <code className="text-accent-secondary">{param.name}</code>
                  <span className="text-text-muted">({param.type})</span>
                  <span className="text-text-secondary">- {param.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {endpoint.queryParams && endpoint.queryParams.length > 0 && (
          <div>
            <h3 className="text-xs uppercase tracking-wider text-text-muted mb-2">
              Query Parameters
            </h3>
            <div className="space-y-1">
              {endpoint.queryParams.map((param) => (
                <div key={param.name} className="flex items-start gap-2 text-sm">
                  <code className="text-accent-secondary">{param.name}</code>
                  <span className="text-text-muted">({param.type})</span>
                  <span className="text-text-secondary">- {param.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-xs uppercase tracking-wider text-text-muted mb-2">Example</h3>
          <a
            href={endpoint.example}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block font-mono text-sm text-accent-secondary hover:underline"
          >
            {endpoint.example} →
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function APIDocumentationPage() {
  const systems = await getAllSystems();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-mono font-bold text-text-primary mb-2">API Documentation</h1>
        <p className="text-text-secondary">
          Access transit system data programmatically via our REST API. All endpoints return JSON
          and require no authentication.
        </p>
      </div>

      {/* Quick Start */}
      <Terminal title="Quick Start">
        <TerminalLine>curl https://publictransit.systems/api/systems</TerminalLine>
        <TerminalOutput>
          {`{"data":[{"id":"wmata","name":"Washington Metropolitan Area Transit Authority",...}],"count":${systems.length}}`}
        </TerminalOutput>
        <TerminalLine prompt="$">
          curl https://publictransit.systems/api/systems/wmata/stations/metro-center
        </TerminalLine>
        <TerminalOutput>
          {`{"data":{"id":"metro-center","name":"Metro Center","lines":["red","blue","orange","silver"],...}}`}
        </TerminalOutput>
      </Terminal>

      {/* Base URL */}
      <Card>
        <CardHeader>
          <CardTitle>Base URL</CardTitle>
        </CardHeader>
        <CardContent>
          <code className="text-accent-primary font-mono bg-bg-tertiary px-3 py-2 rounded block">
            https://publictransit.systems/api
          </code>
          <p className="text-sm text-text-muted mt-2">
            All endpoints are relative to this base URL. CORS is enabled for all origins.
          </p>
        </CardContent>
      </Card>

      {/* Response Format */}
      <Card>
        <CardHeader>
          <CardTitle>Response Format</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-text-secondary">
            All responses are JSON objects with a consistent structure:
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs uppercase tracking-wider text-text-muted mb-2">
                Success Response
              </h3>
              <pre
                className="bg-bg-tertiary p-3 rounded text-sm font-mono overflow-x-auto"
                tabIndex={0}
                aria-label="Success response JSON example"
              >
                {`{
  "data": { ... },
  "count": 42  // for list endpoints
}`}
              </pre>
            </div>
            <div>
              <h3 className="text-xs uppercase tracking-wider text-text-muted mb-2">
                Error Response
              </h3>
              <pre
                className="bg-bg-tertiary p-3 rounded text-sm font-mono overflow-x-auto"
                tabIndex={0}
                aria-label="Error response JSON example"
              >
                {`{
  "error": "Resource not found"
}`}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Available Systems */}
      <Card>
        <CardHeader>
          <CardTitle>Available Systems</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {systems.map((system) => (
              <div key={system.id} className="bg-bg-tertiary rounded p-3">
                <code className="text-accent-primary">{system.id}</code>
                <p className="text-sm text-text-muted mt-1">{system.name}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Endpoints */}
      <div>
        <h2 className="text-xl font-mono font-bold text-text-primary mb-4">Endpoints</h2>
        <div className="space-y-4">
          {endpoints.map((endpoint) => (
            <EndpointCard key={endpoint.path} endpoint={endpoint} />
          ))}
        </div>
      </div>

      {/* Data Types */}
      <Card>
        <CardHeader>
          <CardTitle>Data Types</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="font-mono text-accent-secondary mb-2">Station</h3>
            <pre
              className="bg-bg-tertiary p-3 rounded text-sm font-mono overflow-x-auto"
              tabIndex={0}
              aria-label="Station data type JSON example"
            >
              {`{
  "id": "metro-center",
  "systemId": "wmata",
  "name": "Metro Center",
  "lines": ["red", "blue", "orange", "silver"],
  "opened": "1976-03-27",
  "status": "active",
  "coordinates": { "lat": 38.8983, "lng": -77.0280 },
  "address": "607 13th St NW, Washington, DC 20005",
  "features": ["elevator", "escalator", "fare-vending"],
  "description": "...",
  "entrances": [
    {
      "id": "metro-center-1",
      "name": "11TH ST NW & G ST NW",
      "coordinates": { "lat": 38.898073, "lng": -77.026789 },
      "accessibility": ["escalator"]
    }
  ]
}`}
            </pre>
          </div>

          <div>
            <h3 className="font-mono text-accent-secondary mb-2">Line</h3>
            <pre
              className="bg-bg-tertiary p-3 rounded text-sm font-mono overflow-x-auto"
              tabIndex={0}
              aria-label="Line data type JSON example"
            >
              {`{
  "id": "red",
  "systemId": "wmata",
  "name": "Red Line",
  "color": "red",
  "colorHex": "#bf0d3e",
  "opened": "1976-03-27",
  "status": "active",
  "termini": ["Shady Grove", "Glenmont"],
  "topology": { "type": "linear" },
  "length": 31.8,
  "description": "..."
}`}
            </pre>
          </div>

          <div>
            <h3 className="font-mono text-accent-secondary mb-2">Incident (Outage)</h3>
            <pre
              className="bg-bg-tertiary p-3 rounded text-sm font-mono overflow-x-auto"
              tabIndex={0}
              aria-label="Incident outage data type JSON example"
            >
              {`{
  "unitName": "A01E05",
  "unitType": "escalator",
  "location": "Escalator between mezzanine and platform",
  "symptom": "Minor Repair",
  "outOfServiceSince": "2026-02-05T13:43:00",
  "estimatedReturn": "2026-02-07T23:59:59",
  "updatedAt": "2026-02-05T13:44:20"
}`}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Rate Limits */}
      <Card>
        <CardHeader>
          <CardTitle>Rate Limits & Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-text-secondary mb-4">
            This API is free to use with no authentication required. Please be respectful:
          </p>
          <ul className="list-disc list-inside space-y-1 text-text-secondary">
            <li>Cache responses when possible</li>
            <li>Avoid excessive requests (suggested: max 60 requests/minute)</li>
            <li>Include a User-Agent header identifying your application</li>
            <li>Incident data is updated nightly at 5am UTC</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
