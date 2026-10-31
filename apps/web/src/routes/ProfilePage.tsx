import { useState } from 'react';
import { errorMessage } from '../api/errors';
import { useTasteProfile, useUpdateTasteProfile, type TasteProfile } from '../api/queries';
import { ErrorState, Loading, Notice } from '../components/states';
import { formatDateTime } from '../lib/format';
import pages from './pages.module.css';

function ProfileForm({ profile }: { profile: TasteProfile }) {
  const [body, setBody] = useState(profile.body);
  const save = useUpdateTasteProfile();
  const savedAt = save.data?.updatedAt ?? profile.updatedAt;

  return (
    <form
      className={pages.form}
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(body);
      }}
    >
      <label className="field">
        <span>What you like, avoid and want more of</span>
        <textarea
          rows={14}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Freeform notes. Your agent reads and updates them when it plans a week."
        />
      </label>
      <div className={pages.actions}>
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>
          Save profile
        </button>
        <span className="soft" role="status">
          {savedAt ? `Last saved ${formatDateTime(savedAt)}` : 'Not saved yet'}
        </span>
      </div>
      {save.isError && <Notice>{errorMessage(save.error)}</Notice>}
    </form>
  );
}

export function ProfilePage() {
  const profile = useTasteProfile();
  return (
    <div className="page">
      <h1 tabIndex={-1}>Taste profile</h1>
      {profile.isPending ? (
        <Loading />
      ) : profile.isError ? (
        <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
      ) : (
        <ProfileForm profile={profile.data} />
      )}
    </div>
  );
}
