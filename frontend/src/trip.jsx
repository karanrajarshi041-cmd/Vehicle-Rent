import React from 'react';

export const MAX_TRIP_DAYS = 90;
export const LONG_TRIP_PRESETS = [7, 14, 30];
const DAY_MS = 24 * 60 * 60 * 1000;

// Work with calendar dates rather than local milliseconds so changing timezones
// or crossing a daylight-saving boundary cannot shift a selected trip length.
function calendarTimestamp(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.getTime();
}

export function addTripDays(value, days) {
  const timestamp = calendarTimestamp(value);
  if (timestamp === null || !Number.isInteger(days)) return '';
  const date = new Date(timestamp + days * DAY_MS);
  const pad = n => String(n).padStart(2, '0');
  const result = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  return result + value.slice(10); // Keep a datetime-local time, if one was supplied.
}

export function tripDays(start, end) {
  const a = calendarTimestamp(start), b = calendarTimestamp(end);
  return a === null || b === null ? null : (b - a) / DAY_MS;
}

// Only carry the dates and trip mode into a vehicle detail, not unrelated filters.
export function tripSearch(params) {
  const result = new URLSearchParams();
  for (const key of ['pickup_at', 'return_at']) {
    if (params.get(key)) result.set(key, params.get(key));
  }
  if (params.get('trip') === 'long') result.set('trip', 'long');
  const query = result.toString();
  return query ? `?${query}` : '';
}

export function TripLengthPresets({pickup, returnAt, onChange}) {
  const duration = tripDays(pickup, returnAt);
  const sameTime = (pickup || '').slice(10) === (returnAt || '').slice(10);
  return <div className="trip-presets" role="group" aria-label="Choose trip length">
    <span className="trip-presets-label">Trip length</span>
    {LONG_TRIP_PRESETS.map(days => <button
      key={days}
      type="button"
      className={duration === days && sameTime ? 'selected' : ''}
      aria-pressed={duration === days && sameTime}
      disabled={!pickup || calendarTimestamp(pickup) === null}
      onClick={() => onChange(addTripDays(pickup, days))}
    >{days} days</button>)}
    <span className="trip-presets-note">or choose your own dates · up to 90 days</span>
  </div>;
}
