import settings from '../../appset.json';

/**
 * App-wide flags from /appset.json (project root).
 * requireAuth: true — home page, sign-in, register, saved calendars (original flow).
 * requireAuth: false — site opens on the calendar builder; accounts hidden.
 */
export const requireAuth = settings.requireAuth === true;

export type AppSet = typeof settings;
