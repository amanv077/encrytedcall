import { useState, useCallback, useRef } from 'react';
import { roomService } from '../utils/roomService';

const DEBOUNCE_MS = 300;

/**
 * useSearch – debounced user-directory search against the Matrix homeserver.
 *
 * @returns {{
 *   results: Array<{ userId, displayName, avatarUrl }>,
 *   isSearching: boolean,
 *   search: (term: string) => void,
 *   clearResults: () => void,
 * }}
 */
export function useSearch() {
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef(null);

  const search = useCallback((term) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!term || term.trim().length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await roomService.searchUsers(term.trim());
        setResults(res);
      } catch (err) {
        console.error('[useSearch] search error:', err);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, DEBOUNCE_MS);
  }, []);

  const clearResults = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setResults([]);
    setIsSearching(false);
  }, []);

  return { results, isSearching, search, clearResults };
}
