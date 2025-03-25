/**
 * Functional programming utilities
 * Provides tools for immutability and functional error handling
 */

/**
 * Result type for functional error handling
 * Represents either a successful or failed operation
 */
export const Result = {
  /**
   * Creates a successful result
   * @param {*} value - The success value
   * @returns {Object} A success result object
   */
  ok: (value) => Object.freeze({
    status: 'OK',
    value,
    isOk: true,
    isError: false,
    map: (fn) => Result.ok(fn(value)),
    flatMap: (fn) => fn(value),
    fold: (_, successFn) => successFn(value),
    unwrap: () => value
  }),

  /**
   * Creates an error result
   * @param {*} error - The error value
   * @returns {Object} An error result object
   */
  error: (error) => Object.freeze({
    status: 'ERROR',
    error,
    isOk: false,
    isError: true,
    map: (_) => Result.error(error),
    flatMap: (_) => Result.error(error),
    fold: (errorFn, _) => errorFn(error),
    unwrapError: () => error
  })
};

/**
 * Freezes an object deeply to enforce immutability
 * @param {Object} obj - The object to freeze
 * @returns {Object} The frozen object
 */
export const deepFreeze = (obj) => {
  // Return early for null, non-objects, or already frozen objects
  if (obj === null || typeof obj !== "object" || Object.isFrozen(obj)) {
    return obj;
  }
  
  // Get all properties, including non-enumerable ones
  const propNames = Object.getOwnPropertyNames(obj);
  
  // Freeze properties using functional approach
  propNames.reduce((_, name) => {
    const value = obj[name];
    if (value && typeof value === "object") {
      deepFreeze(value);
    }
    return null; // We don't actually use the accumulator
  }, null);
  
  return Object.freeze(obj);
};

/**
 * Functional composition (right to left)
 * @param {...Function} fns - Functions to compose
 * @returns {Function} Composed function
 */
export const compose = (...fns) => (x) => 
  fns.reduceRight((acc, fn) => fn(acc), x);

/**
 * Functional composition (left to right)
 * @param {...Function} fns - Functions to compose
 * @returns {Function} Composed function
 */
export const pipe = (...fns) => (x) => 
  fns.reduce((acc, fn) => fn(acc), x);

/**
 * Asynchronous functional composition (left to right)
 * Properly chains promises, awaiting each step before proceeding to the next
 * Uses a purely functional approach with reduce instead of imperative loops
 * @param {...Function} fns - Async or sync functions to compose
 * @returns {Function} Async composed function
 */
export const pipeAsync = (...fns) => async (initialValue) => {
  // Si no hay funciones, devolver el valor inicial
  if (fns.length === 0) {
    return initialValue;
  }
  
  // Usar reduce para componer las funciones de manera funcional
  // Comenzamos con una promesa resuelta con el valor inicial
  return fns.reduce(
    (promiseChain, fn) => promiseChain.then(fn),
    Promise.resolve(initialValue)
  );
};

/**
 * Creates a curried version of a function
 * @param {Function} fn - Function to curry
 * @returns {Function} Curried function
 */
export const curry = (fn) => {
  const arity = fn.length;
  
  return function curried(...args) {
    if (args.length >= arity) {
      return fn(...args);
    }
    
    return (...moreArgs) => curried(...args, ...moreArgs);
  };
};

/**
 * Safely accesses a nested property in an object
 * @param {Object} obj - The object to access
 * @param {String} path - The path to the property (dot notation)
 * @param {*} defaultValue - Default value if property doesn't exist
 * @returns {*} The property value or default value
 */
export const safeGet = (obj, path, defaultValue = null) => {
  if (!obj || !path) return defaultValue;
  
  const keys = path.split('.');
  const result = keys.reduce((acc, key) => 
    acc && acc[key] !== undefined ? acc[key] : undefined, 
    obj
  );
  
  return result !== undefined ? result : defaultValue;
};

/**
 * Creates a new object with a property set at the specified path
 * @param {Object} obj - The source object
 * @param {String} path - The path to set (dot notation)
 * @param {*} value - The value to set
 * @returns {Object} A new object with the property set
 */
export const safeSet = (obj, path, value) => {
  if (!path) return obj;
  
  const keys = path.split('.');
  
  if (keys.length === 1) {
    return { ...obj, [keys[0]]: value };
  }
  
  const [first, ...rest] = keys;
  const nextObj = obj[first] || {};
  
  return {
    ...obj,
    [first]: safeSet(nextObj, rest.join('.'), value)
  };
};

/**
 * Wraps a function to catch any errors and return a Result
 * @param {Function} fn - The function to wrap
 * @returns {Function} A function that returns a Result
 */
export const tryCatch = (fn) => (...args) => {
  try {
    const result = fn(...args);
    
    // Prevenir anidamiento de Results
    if (result && typeof result === 'object' && 
        'isOk' in result && 'isError' in result && 
        (result.status === 'OK' || result.status === 'ERROR')) {
      return result; // Ya es un Result, devolverlo directamente
    }
    
    return Result.ok(result);
  } catch (error) {
    return Result.error(error instanceof Error ? error : new Error(String(error)));
  }
};

/**
 * Wraps an async function to catch any errors and return a Result
 * @param {Function} fn - The async function to wrap
 * @returns {Function} A function that returns a Promise<Result>
 */
export const tryCatchAsync = (fn) => async (...args) => {
  try {
    const result = await fn(...args);
    
    // Prevenir anidamiento de Results
    if (result && typeof result === 'object' && 
        'isOk' in result && 'isError' in result && 
        (result.status === 'OK' || result.status === 'ERROR')) {
      return result; // Ya es un Result, devolverlo directamente
    }
    
    return Result.ok(result);
  } catch (error) {
    return Result.error(error instanceof Error ? error : new Error(String(error)));
  }
};

/**
 * Creates a new object without the specified keys
 * @param {Object} obj - The source object
 * @param {Array<String>} keys - Keys to omit
 * @returns {Object} A new object without the specified keys
 */
export const omit = (obj, keys) => {
  return Object.keys(obj)
    .filter(key => !keys.includes(key))
    .reduce((acc, key) => {
      acc[key] = obj[key];
      return acc;
    }, {});
};

/**
 * Creates a new object with only the specified keys
 * @param {Object} obj - The source object
 * @param {Array<String>} keys - Keys to pick
 * @returns {Object} A new object with only the specified keys
 */
export const pick = (obj, keys) => {
  return keys.reduce((acc, key) => 
    obj.hasOwnProperty(key) 
      ? { ...acc, [key]: obj[key] }
      : acc
  , {});
};

/**
 * Converts a value to an array if it's not already
 * @param {*} value - The value to convert
 * @returns {Array} The value as an array
 */
export const toArray = (value) => 
  Array.isArray(value) ? value : [value];

/**
 * Returns the first defined value from a list of values
 * @param {...*} values - Values to check
 * @returns {*} The first defined value
 */
export const firstDefined = (...values) => 
  values.find(v => v !== undefined && v !== null);

/**
 * Creates a new array with the item at the specified index replaced
 * @param {Array} arr - The source array
 * @param {Number} index - The index to replace
 * @param {*} value - The new value
 * @returns {Array} A new array with the item replaced
 */
export const replaceAt = (arr, index, value) => [
  ...arr.slice(0, index),
  value,
  ...arr.slice(index + 1)
];

/**
 * Creates a new array with the item at the specified index updated
 * @param {Array} arr - The source array
 * @param {Number} index - The index to update
 * @param {Function} updater - Function to update the item
 * @returns {Array} A new array with the item updated
 */
export const updateAt = (arr, index, updater) => 
  replaceAt(arr, index, updater(arr[index]));

/**
 * Creates a new array with an item inserted at the specified index
 * @param {Array} arr - The source array
 * @param {Number} index - The index to insert at
 * @param {*} value - The value to insert
 * @returns {Array} A new array with the item inserted
 */
export const insertAt = (arr, index, value) => [
  ...arr.slice(0, index),
  value,
  ...arr.slice(index)
];

/**
 * Creates a new array with the item at the specified index removed
 * @param {Array} arr - The source array
 * @param {Number} index - The index to remove
 * @returns {Array} A new array with the item removed
 */
export const removeAt = (arr, index) => [
  ...arr.slice(0, index),
  ...arr.slice(index + 1)
];

/**
 * Creates a new array with items matching the predicate removed
 * @param {Array} arr - The source array
 * @param {Function} predicate - Function to test items
 * @returns {Array} A new array with matching items removed
 */
export const removeWhere = (arr, predicate) => 
  arr.filter(item => !predicate(item));

/**
 * Creates a new array with items matching the predicate updated
 * @param {Array} arr - The source array
 * @param {Function} predicate - Function to test items
 * @param {Function} updater - Function to update matching items
 * @returns {Array} A new array with matching items updated
 */
export const updateWhere = (arr, predicate, updater) => 
  arr.map(item => predicate(item) ? updater(item) : item);
