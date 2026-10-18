/**
 * Host half of the feature dock bundle.
 *
 * The bundle exists so the Loader has a row whose package declares `dsh.client`;
 * the Client module owns the dock, the icons and the toggles. Nothing here runs
 * in the Host beyond activation: the orb toggle talks to the orb host's own
 * `/.dsh-orb` routes from the browser, and the wallpaper toggle is a display
 * rule applied by the browser half.
 */
export function apply() {}
