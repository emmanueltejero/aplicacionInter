import { useEffect, useState } from 'react';
import type { Player, Register } from '../domain';
import type { Match } from '../matches';
import type { ReportFilters } from '../attendanceReport';
import type { MatchesRepository } from '../data/matchesRepository';
import { AttendanceReport } from './AttendanceReport';

export function PlayerSummary({ teamId, teamName, roster, register, filters, onChange, repository }: {
  teamId: string; teamName: string; roster: Player[]; register: Register; filters: ReportFilters;
  onChange: (filters: ReportFilters) => void; repository: MatchesRepository;
}) {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    repository.load(teamId).then(data => { if (active) { setMatches(data); setError(''); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los partidos.'); });
    return () => { active = false; };
  }, [teamId, repository, attempt]);
  return <AttendanceReport teamName={teamName} roster={roster} register={register} filters={filters} onChange={onChange}
    matches={matches} matchesError={error} onRetryMatches={() => { setMatches(null); setError(''); setAttempt(value => value + 1); }} />;
}
