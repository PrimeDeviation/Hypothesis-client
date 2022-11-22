/**
 * Parse annotation filter queries into structured representations.
 *
 * Provides methods to parse Lucene-style queries ("foo tag: bar")
 * into structured representations which are then used by other services to
 * filter annotations displayed to the user or fetched from the API.
 */

/**
 * Splits a search term into filter and data.
 *
 * ie. 'user:johndoe' -> ['user', 'johndoe']
 *     'example:text' -> [null, 'example:text']
 *
 * @param {string} term
 * @return {[null|string, string]}
 */
function splitTerm(term) {
  const filter = term.slice(0, term.indexOf(':'));
  if (!filter) {
    // The whole term is data
    return [null, term];
  }

  if (
    ['group', 'quote', 'since', 'tag', 'text', 'uri', 'user'].includes(filter)
  ) {
    const data = term.slice(filter.length + 1);
    return [filter, data];
  } else {
    // The filter is not a power search filter, so the whole term is data
    return [null, term];
  }
}

/**
 * Remove a quote character from the beginning and end of the string, but
 * only if they match. ie:
 *
-*   'foo' -> foo
-*   "bar" -> bar
-*   'foo" -> 'foo"
-*    bar"  -> bar"
 *
 * @param {string} text
 */
function removeSurroundingQuotes(text) {
  const start = text.slice(0, 1);
  const end = text.slice(-1);
  if ((start === '"' || start === "'") && start === end) {
    text = text.slice(1, text.length - 1);
  }
  return text;
}

/**
 * Tokenize a search query.
 *
 * Split `searchText` into an array of non-empty tokens. Terms not contained
 * within quotes are split on whitespace. Terms inside single or double quotes
 * are returned as whole tokens, with the surrounding quotes removed.
 *
 * @param {string} searchText
 * @return {string[]}
 */
function tokenize(searchText) {
  const tokenMatches = searchText.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
  if (!tokenMatches) {
    return [];
  }

  return tokenMatches
    .map(removeSurroundingQuotes)
    .filter(token => token.length > 0)
    .map(token => {
      // Strip quotes from field values.
      // eg. `tag:"foo bar"` => `tag:foo bar`.
      const [filter, data] = splitTerm(token);
      if (filter) {
        return filter + ':' + removeSurroundingQuotes(data);
      } else {
        return token;
      }
    });
}

/**
 * Parse a search query into a map of search field to term.
 *
 * @param {string} searchText
 * @return {Record<string,string[]>}
 */
export function toObject(searchText) {
  /** @type {Record<string,string[]>} */
  const obj = {};

  /** @param {string} field */
  const backendFilter = field => (field === 'tag' ? 'tags' : field);

  const terms = tokenize(searchText);
  for (const term of terms) {
    let [field, data] = splitTerm(term);
    if (!field) {
      field = 'any';
      data = term;
    }

    const backendField = backendFilter(field);
    if (obj[backendField]) {
      obj[backendField].push(data);
    } else {
      obj[backendField] = [data];
    }
  }

  return obj;
}

/**
 * @typedef Facet
 * @prop {'and'|'or'} operator
 * @prop {string[]|number[]} terms
 */

/**
 * @typedef FocusFilter
 * @prop {string} [user]
 */

/**
 * Parse a search query into a map of filters.
 *
 * Returns an object mapping facet names to Facet.
 *
 * Terms that are not associated with a particular facet are stored in the "any"
 * facet.
 *
 * @param {string} searchText - Filter query to parse
 * @param {FocusFilter} focusFilters - Additional filter terms to mix in
 * @return {Record<string,Facet>}
 */
export function generateFacetedFilter(searchText, focusFilters = {}) {
  const any = [];
  const quote = [];
  const since = [];
  const tag = [];
  const text = [];
  const uri = [];
  const user = focusFilters.user ? [focusFilters.user] : [];

  const terms = tokenize(searchText);

  for (const term of terms) {
    const filter = term.slice(0, term.indexOf(':'));
    const fieldValue = term.slice(filter.length + 1);

    switch (filter) {
      case 'quote':
        quote.push(fieldValue);
        break;
      case 'since':
        {
          const time = term.slice(6).toLowerCase();
          const secondsPerDay = 24 * 60 * 60;
          const secondsPerUnit = {
            sec: 1,
            min: 60,
            hour: 60 * 60,
            day: secondsPerDay,
            week: 7 * secondsPerDay,
            month: 30 * secondsPerDay,
            year: 365 * secondsPerDay,
          };
          const match = time.match(
            /^(\d+)(sec|min|hour|day|week|month|year)?$/
          );
          if (match) {
            const value = parseFloat(match[1]);
            const unit = /** @type {keyof secondsPerUnit} */ (
              match[2] || 'sec'
            );
            since.push(value * secondsPerUnit[unit]);
          }
        }
        break;
      case 'tag':
        tag.push(fieldValue);
        break;
      case 'text':
        text.push(fieldValue);
        break;
      case 'uri':
        uri.push(fieldValue);
        break;
      case 'user':
        user.push(fieldValue);
        break;
      default:
        any.push(term);
    }
  }

  return {
    any: {
      terms: any,
      operator: 'and',
    },
    quote: {
      terms: quote,
      operator: 'and',
    },
    since: {
      terms: since,
      operator: 'and',
    },
    tag: {
      terms: tag,
      operator: 'and',
    },
    text: {
      terms: text,
      operator: 'and',
    },
    uri: {
      terms: uri,
      operator: 'or',
    },
    user: {
      terms: user,
      operator: 'or',
    },
  };
}
