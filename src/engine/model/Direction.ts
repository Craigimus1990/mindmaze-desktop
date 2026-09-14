export type Direction = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST'

export const DIRECTIONS: readonly Direction[] = ['NORTH', 'SOUTH', 'EAST', 'WEST']

export const opposite = (d: Direction): Direction => {
  switch (d) {
    case 'NORTH': return 'SOUTH'
    case 'SOUTH': return 'NORTH'
    case 'EAST': return 'WEST'
    case 'WEST': return 'EAST'
  }
}

/** Grid is 10 wide; a room id is row * 10 + col. */
export const GRID_SIZE = 10

export const directionOffset = (d: Direction): number => {
  switch (d) {
    case 'NORTH': return -GRID_SIZE
    case 'SOUTH': return GRID_SIZE
    case 'EAST': return 1
    case 'WEST': return -1
  }
}
