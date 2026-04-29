import React, { forwardRef } from 'react';

// Stack — primitivo de layout flexbox.
//
// Reemplaza a las decenas de divs con className="flex flex-col gap-4 items-center"
// repartidas por todo el codebase. Type-safe: gap/align/justify son enums no strings.
//
// API:
//   <Stack direction="vertical" gap={4} align="center" justify="between">...</Stack>
//   <HStack gap={2}>...</HStack>   (alias horizontal)
//   <VStack gap={6}>...</VStack>   (alias vertical)
//
// Why no usar simplemente Tailwind classes?
// 1. Type-safety: typo en `gap-44` no falla en compile, sí lo notas en runtime.
// 2. Refactor seguro: cambiar gap default propaga a todos los usos.
// 3. Lectura: <VStack gap={4}> es más expresivo que <div className="flex flex-col gap-4">.

export type StackDirection = 'horizontal' | 'vertical';
export type StackGap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16;
export type StackAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
export type StackJustify = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
export type StackWrap = 'nowrap' | 'wrap' | 'reverse';

interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: StackDirection;
  gap?: StackGap;
  align?: StackAlign;
  justify?: StackJustify;
  wrap?: StackWrap;
  fullWidth?: boolean;
  inline?: boolean;
  /** Aplica divider <hr> entre cada hijo (útil en menús, listas). */
  divider?: boolean;
  as?: React.ElementType;
}

const directionClass: Record<StackDirection, string> = {
  horizontal: 'flex-row',
  vertical:   'flex-col',
};

const alignClass: Record<StackAlign, string> = {
  start:    'items-start',
  center:   'items-center',
  end:      'items-end',
  stretch:  'items-stretch',
  baseline: 'items-baseline',
};

const justifyClass: Record<StackJustify, string> = {
  start:   'justify-start',
  center:  'justify-center',
  end:     'justify-end',
  between: 'justify-between',
  around:  'justify-around',
  evenly:  'justify-evenly',
};

const wrapClass: Record<StackWrap, string> = {
  nowrap:  'flex-nowrap',
  wrap:    'flex-wrap',
  reverse: 'flex-wrap-reverse',
};

const gapClass = (gap: StackGap): string => `gap-${gap}`;

export const Stack = forwardRef<HTMLDivElement, StackProps>(
  (
    {
      direction = 'vertical',
      gap = 4,
      align,
      justify,
      wrap = 'nowrap',
      fullWidth = false,
      inline = false,
      divider = false,
      as: Component = 'div',
      className = '',
      children,
      ...props
    },
    ref,
  ) => {
    const classes = [
      inline ? 'inline-flex' : 'flex',
      directionClass[direction],
      gapClass(gap),
      align ? alignClass[align] : '',
      justify ? justifyClass[justify] : '',
      wrapClass[wrap],
      fullWidth ? 'w-full' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    if (!divider) {
      return (
        <Component ref={ref} className={classes} {...props}>
          {children}
        </Component>
      );
    }

    // Insertar dividers entre hijos cuando divider=true
    const arr = React.Children.toArray(children);
    const dividerEl = (
      <hr
        className={
          direction === 'vertical'
            ? 'border-t border-velum-100 w-full'
            : 'border-l border-velum-100 h-full self-stretch'
        }
      />
    );

    return (
      <Component ref={ref} className={classes} {...props}>
        {arr.map((child, i) => (
          <React.Fragment key={i}>
            {child}
            {i < arr.length - 1 && dividerEl}
          </React.Fragment>
        ))}
      </Component>
    );
  },
);

Stack.displayName = 'Stack';

// Aliases por DX — `HStack`/`VStack` se leen mejor en JSX.
export const HStack = forwardRef<HTMLDivElement, Omit<StackProps, 'direction'>>(
  (props, ref) => <Stack ref={ref} direction="horizontal" {...props} />,
);
HStack.displayName = 'HStack';

export const VStack = forwardRef<HTMLDivElement, Omit<StackProps, 'direction'>>(
  (props, ref) => <Stack ref={ref} direction="vertical" {...props} />,
);
VStack.displayName = 'VStack';
