/**
 * Utility functions for working with aggregates in Event Sourcing
 * Pure functions with no side effects
 */
import { Result, deepFreeze } from './functional.js';

/**
 * Validates that an object has a valid email field as aggregate ID
 * @param {Object} obj - Object to validate
 * @returns {Result} - Result with the object or an error
 */
export const validateAggregateId = (obj) => 
  !obj
    ? Result.error(new Error('Cannot validate null or undefined object'))
    : !obj.email
      ? Result.error(new Error('Missing required email field as aggregate ID'))
      : Result.ok(obj);

/**
 * Ensures an object has an email field as aggregate ID
 * @param {Object} obj - Object to ensure has an email
 * @param {string} defaultEmail - Default email to use if not present
 * @returns {Object} - Object with email
 */
export const ensureAggregateId = (obj, defaultEmail) =>
  !obj
    ? Promise.reject(new Error('Cannot ensure email on null or undefined object'))
    : !obj.email && !defaultEmail
      ? Promise.reject(new Error('Missing required email and no default provided'))
      : Promise.resolve(deepFreeze({
          ...obj,
          email: obj.email || defaultEmail
        }));

/**
 * Groups events by aggregate ID (email)
 * @param {Array} events - Array of events to group
 * @returns {Object} - Object with email as keys and arrays of events as values
 */
export const groupEventsByAggregateId = (events) =>
  !Array.isArray(events)
    ? {}
    : events.reduce(
        (groups, event) => !event.email
          ? groups
          : {
              ...groups,
              [event.email]: [...(groups[event.email] || []), event]
            },
        {}
      );

/**
 * Filters events by aggregate ID (email)
 * @param {Array} events - Array of events to filter
 * @param {string} email - Email to filter by
 * @returns {Array} - Array of events for the specified email
 */
export const filterEventsByAggregateId = (events, email) =>
  !Array.isArray(events) || !email
    ? []
    : events.filter(event => event.email === email);

/**
 * Creates a function that fetches events for a specific aggregate
 * @param {Function} fetchEvents - Function to fetch all events
 * @returns {Function} - Function that takes an email and returns events for that aggregate
 */
export const createAggregateEventsFetcher = (fetchEvents) => (email) =>
  !email
    ? Promise.resolve(Result.error(new Error('Missing required email for fetching aggregate events')))
    : fetchEvents()
        .then(eventsResult => 
          eventsResult.isError
            ? eventsResult
            : Result.ok(filterEventsByAggregateId(eventsResult.unwrap(), email))
        );
