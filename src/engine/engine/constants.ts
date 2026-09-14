/**
 * Gate pair id for the barrier on the treasure room, raised by the windlasses.
 *
 * Kotlin declared this on MazeGenerator, but MazeGenerator calls MazeSolver.isSolvable and
 * MazeSolver needs the id — a cycle under ES modules. Both import it from here instead.
 */
export const TREASURE_GATE_ID = 'treasure'
