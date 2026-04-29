// Barrel del design system VELUM.
//
// Imports preferidos:
//   import { Button, TextField, Card, VStack } from "@/components/ui";
//
// (El alias @ no está configurado aún — usar path relativo por ahora.)

export { Button } from './Button';
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
