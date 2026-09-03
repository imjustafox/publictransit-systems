import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Terminal, TerminalLine, TerminalOutput } from "@/components/ui/Terminal";

export default function AboutPage() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <section className="space-y-4">
        <Terminal title="about.md" scanline>
          <TerminalLine>cat about.md</TerminalLine>
          <TerminalOutput>Transit Systems Information Platform v1.0.0</TerminalOutput>
        </Terminal>

        <h1 className="text-4xl font-mono font-bold text-text-primary">
          About <span className="text-accent-primary">PublicTransit.Systems</span>
        </h1>
      </section>

      {/* Project Overview */}
      <Card elevated>
        <CardHeader>
          <CardTitle>Project Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-text-secondary leading-relaxed mb-4">
            PublicTransit.Systems is a comprehensive information platform for public transit systems
            worldwide. Built with a terminal-inspired aesthetic, it provides detailed data about
            metro systems, light rail, and rapid transit networks including stations, lines,
            railcars, and historical information.
          </p>
          <p className="text-text-secondary leading-relaxed">
            The platform emphasizes data density, technical precision, and a unique visual style
            that appeals to transit enthusiasts, urban planners, developers, and anyone interested
            in public transportation infrastructure.
          </p>
        </CardContent>
      </Card>

      {/* Data Sources */}
      <Card elevated>
        <CardHeader>
          <CardTitle>Data Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-text-secondary">
              Transit system data is compiled from official sources and public records:
            </p>
            <ul className="space-y-2 text-text-secondary">
              <li className="flex items-start gap-2">
                <span className="text-accent-primary mt-1">•</span>
                <span>Official transit authority websites and published statistics</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent-primary mt-1">•</span>
                <span>Public transportation databases and archives</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent-primary mt-1">•</span>
                <span>Open data initiatives and government transparency programs</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent-primary mt-1">•</span>
                <span>Historical records and transit system documentation</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Contributing */}
      <Card elevated>
        <CardHeader>
          <CardTitle>Contributing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-text-secondary">
              Help improve PublicTransit.Systems by contributing data, corrections, or code:
            </p>

            <div>
              <h3 className="font-mono text-sm text-accent-primary mb-2">Adding New Systems</h3>
              <Terminal>
                <TerminalLine>mkdir -p data/systems/your-system-id</TerminalLine>
                <TerminalLine>touch data/systems/your-system-id/system.json</TerminalLine>
                <TerminalLine>touch data/systems/your-system-id/lines.json</TerminalLine>
                <TerminalLine>touch data/systems/your-system-id/stations.json</TerminalLine>
                <TerminalLine>touch data/systems/your-system-id/railcars.json</TerminalLine>
              </Terminal>
            </div>

            <p className="text-sm text-text-secondary">
              Follow the schema defined in existing system files. Submit corrections or additions
              via{" "}
              <a
                href="https://github.com/imjustafox/publictransit-systems/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-primary underline underline-offset-2 hover:no-underline"
              >
                GitHub issues
              </a>{" "}
              or{" "}
              <a
                href="https://github.com/imjustafox/publictransit-systems/pulls"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-primary underline underline-offset-2 hover:no-underline"
              >
                pull requests
              </a>
              .
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Features */}
      <Card elevated>
        <CardHeader>
          <CardTitle>Platform Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h3 className="font-mono text-sm text-accent-primary">✓ System Profiles</h3>
              <p className="text-sm text-text-secondary">
                Detailed information about each transit system including stats, history, and
                infrastructure
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-mono text-sm text-accent-primary">✓ Station Database</h3>
              <p className="text-sm text-text-secondary">
                Complete station listings with coordinates, amenities, and line connections
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-mono text-sm text-accent-primary">✓ Line Information</h3>
              <p className="text-sm text-text-secondary">
                Route details, termini, lengths, and official colors for all lines
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-mono text-sm text-accent-primary">✓ Railcar Fleet Data</h3>
              <p className="text-sm text-text-secondary">
                Technical specifications and history of rolling stock across systems
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-mono text-sm text-accent-primary">✓ Command Palette</h3>
              <p className="text-sm text-text-secondary">
                Fast keyboard-driven search across all systems, stations, lines, and railcars
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-mono text-sm text-accent-primary">✓ System Comparison</h3>
              <p className="text-sm text-text-secondary">
                Side-by-side analysis tools with metrics and visualizations
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Open Source */}
      <Card elevated>
        <CardHeader>
          <CardTitle>Open Source</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-text-secondary mb-4">
            PublicTransit.Systems is fully open source. Browse the code, report issues, or
            contribute on GitHub.
          </p>
          <a
            href="https://github.com/imjustafox/publictransit-systems"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded border border-border bg-bg-secondary hover:bg-bg-tertiary hover:border-border-hover transition-all font-mono text-sm text-accent-primary"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            imjustafox/publictransit-systems
          </a>
        </CardContent>
      </Card>

      {/* License */}
      <Card>
        <CardContent>
          <p className="text-sm text-text-muted font-mono">
            © 2026 PublicTransit.Systems • Data compiled from public sources • Built with Next.js
            and TypeScript
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
