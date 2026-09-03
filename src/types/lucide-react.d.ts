declare module "lucide-react" {
  import { FC, SVGProps } from "react";

  export interface LucideProps extends SVGProps<SVGSVGElement> {
    size?: number | string;
    absoluteStrokeWidth?: boolean;
  }

  export type LucideIcon = FC<LucideProps>;

  export const Search: LucideIcon;
  export const MapPin: LucideIcon;
  export const Train: LucideIcon;
  export const CreditCard: LucideIcon;
  export const TrendingUp: LucideIcon;
  export const Route: LucideIcon;
  export const Users: LucideIcon;
  export const ChevronRight: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const ChevronUp: LucideIcon;
  export const X: LucideIcon;
  export const Menu: LucideIcon;
  export const Moon: LucideIcon;
  export const Sun: LucideIcon;
  export const Settings: LucideIcon;
  export const Info: LucideIcon;
  export const AlertCircle: LucideIcon;
  export const CheckCircle: LucideIcon;
  export const XCircle: LucideIcon;
  export const Calendar: LucideIcon;
  export const Clock: LucideIcon;
  export const ExternalLink: LucideIcon;
  export const Copy: LucideIcon;
  export const Download: LucideIcon;
  export const Share: LucideIcon;
  export const Filter: LucideIcon;
  export const SortAsc: LucideIcon;
  export const SortDesc: LucideIcon;
  export const BarChart3: LucideIcon;
  export const PieChart: LucideIcon;
  export const Activity: LucideIcon;
  export const Layers: LucideIcon;
  export const GitCompare: LucideIcon;
}
