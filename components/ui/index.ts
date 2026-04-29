// Barrel del design system VELUM.
//
// Imports preferidos:
//   import { Button, TextField, Card, VStack } from "@/components/ui";
//
// (El alias @ no está configurado aún — usar path relativo por ahora.)

export { Button, buttonStyles } from './Button';
export type { ButtonVariant, ButtonSize } from './Button';

export { IconButton } from './IconButton';
export type { IconButtonSize } from './IconButton';

export { TextField } from './TextField';
export type { TextFieldSize } from './TextField';

export { Card, CardHeader, CardTitle, CardDescription, CardFooter } from './Card';
export type { CardVariant, CardPadding } from './Card';

export { Badge } from './Badge';
export type { BadgeIntent } from './Badge';

export { Stack, HStack, VStack } from './Stack';
export type { StackDirection, StackGap, StackAlign, StackJustify, StackWrap } from './Stack';

export { Skeleton, SkeletonText, SkeletonAvatar, SkeletonCard, SkeletonTable } from './Skeleton';
export type { SkeletonVariant } from './Skeleton';

export { EmptyState } from './EmptyState';
export type { EmptyStateSize } from './EmptyState';

export { Modal, ModalFooter } from './Modal';
export type { ModalSize } from './Modal';

export { Drawer } from './Drawer';
export type { DrawerSide, DrawerSize } from './Drawer';

export { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs';

export { Tooltip } from './Tooltip';
export type { TooltipPlacement } from './Tooltip';

export { PageHeader, Breadcrumbs } from './PageHeader';
export type { BreadcrumbItem } from './PageHeader';

export { MobileBottomNav } from './MobileBottomNav';
export type { BottomNavItem } from './MobileBottomNav';

export { DensityToggle } from './DensityToggle';

export {
  CommandPalette,
  CommandPaletteProvider,
  useCommandPalette,
} from './CommandPalette';
export type { CommandItem } from './CommandPalette';

export { DataTable } from './DataTable';
export type { Column, SortDirection } from './DataTable';

export { SectionHeading } from './SectionHeading';
export { SectionNav } from './SectionNav';
export type { SectionNavItem } from './SectionNav';
