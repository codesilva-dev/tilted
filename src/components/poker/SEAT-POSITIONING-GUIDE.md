# Seat Positioning Guide

## How It Works

The poker table uses a **hybrid positioning system** that professional poker games use:

1. **Mathematical Base**: Seats are automatically positioned in a circle using trigonometry
2. **Manual Adjustments**: You can override any seat's position with custom coordinates

## Quick Start: Adjusting Seat Positions

Open `PokerTable.tsx` and find the `SEAT_CONFIG` object around line 60.

### Method 1: Adjust the Circle (Easiest)

Modify the `generateCircularPositions()` parameters:

```typescript
const SEAT_CONFIG: Record<number, SeatConfig> = {
  ...generateCircularPositions(
    9,      // totalSeats
    50,     // centerX (0-100, % from left)
    50,     // centerY (0-100, % from top)
    40,     // radiusX (horizontal radius %)
    45,     // radiusY (vertical radius %)
    -90     // startAngle (degrees, -90 = top)
  ),
};
```

**Tips:**
- Increase `radiusX`/`radiusY` to move seats away from center
- Decrease them to bring seats closer
- Change `startAngle` to rotate all seats (e.g., 0 = right, -90 = top)
- Use different `radiusX` and `radiusY` for an oval shape

### Method 2: Override Individual Seats (Most Control)

Uncomment and modify specific seats in the manual adjustments section:

```typescript
const SEAT_CONFIG: Record<number, SeatConfig> = {
  ...generateCircularPositions(9),

  // Manual overrides
  1: { x: 50, y: 5, offsetX: 0, offsetY: 0 },   // Move seat 1 to top
  6: { x: 50, y: 92, offsetX: 0, offsetY: 0 },  // Move seat 6 to bottom
};
```

**Coordinate System:**
- `x`: Horizontal position (0 = left edge, 50 = center, 100 = right edge)
- `y`: Vertical position (0 = top edge, 50 = center, 100 = bottom edge)
- `offsetX`: Pixel adjustment left/right (negative = left, positive = right)
- `offsetY`: Pixel adjustment up/down (negative = up, positive = down)

### Method 3: Fine-Tuning with Pixel Offsets

Keep the base position but nudge it slightly:

```typescript
1: { x: 50, y: 5, offsetX: -10, offsetY: 5 },  // Move 10px left, 5px down
```

## Workflow for Positioning

1. **Start with the circle**: Adjust `radiusX`, `radiusY`, `centerX`, `centerY` to get close
2. **Save and view in browser**: Hot reload will show changes instantly
3. **Override problem seats**: If some seats look off, override them individually
4. **Fine-tune with offsets**: Use pixel offsets for final adjustments

## Example: Making Seats Follow Table Image

If your table.jpg has a specific shape:

```typescript
const SEAT_CONFIG: Record<number, SeatConfig> = {
  // Use an ellipse that matches the table
  ...generateCircularPositions(9, 50, 50, 42, 38, -90),

  // Fine-tune seats that don't align
  3: { x: 85, y: 35, offsetX: 5, offsetY: -2 },
  9: { x: 15, y: 35, offsetX: -5, offsetY: -2 },
};
```

## Tips

- The table container is now `aspect-[16/10]` to match typical poker table proportions
- If you change the table image, you might need to adjust the aspect ratio in line 194
- All positions use percentages, so they scale with the table size
- Use browser dev tools to inspect seat positions and see their calculated CSS

## Visual Debug Mode (Optional)

Add this temporarily to see seat numbers clearly:

```typescript
// In renderSeat(), add this to the seat div:
className="absolute text-6xl text-red-500 font-bold"
```

This will help you identify which seat is which while positioning.
