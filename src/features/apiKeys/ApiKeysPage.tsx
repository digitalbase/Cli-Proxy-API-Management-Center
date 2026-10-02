import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { useAuthStore, useNotificationStore } from '@/stores';
import { apiKeysApi } from '@/services/api';
import { copyToClipboard } from '@/utils/clipboard';
import { generateSecureApiKey } from '@/utils/apiKey';
import { maskApiKey } from '@/utils/format';
import { isValidApiKeyCharset } from '@/utils/validation';
import { ApiKeyStrengthMeter } from '@/features/config/components/blocks/ApiKeyStrengthMeter';
import {
  apiKeyNameFingerprint,
  readApiKeyNames,
  saveApiKeyName,
} from '@/features/config/apiKeyNames';
import styles from './ApiKeysPage.module.scss';

export function ApiKeysPage() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const apiBase = useAuthStore((state) => state.apiBase);
  const [keys, setKeys] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [showDraft, setShowDraft] = useState(false);
  const [formError, setFormError] = useState('');

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setKeys(await apiKeysApi.list());
      setNames(readApiKeyNames(apiBase));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('api_keys.load_error'));
    } finally {
      setLoading(false);
    }
  }, [apiBase, t]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const closeModal = () => {
    setModalOpen(false);
    setEditingIndex(null);
    setDraft('');
    setNameDraft('');
    setShowDraft(false);
    setFormError('');
  };

  const openAdd = () => {
    setEditingIndex(null);
    setDraft('');
    setNameDraft('');
    setShowDraft(false);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (index: number) => {
    setEditingIndex(index);
    setDraft(keys[index] ?? '');
    setNameDraft(names[apiKeyNameFingerprint(apiBase, keys[index] ?? '')] ?? '');
    setShowDraft(false);
    setFormError('');
    setModalOpen(true);
  };

  const saveDraft = async () => {
    const next = draft.trim();
    if (!next) {
      setFormError(t('api_keys.error_empty'));
      return;
    }
    if (!isValidApiKeyCharset(next)) {
      setFormError(t('api_keys.error_invalid'));
      return;
    }

    const nextKeys = [...keys];
    if (editingIndex === null) nextKeys.push(next);
    else nextKeys[editingIndex] = next;

    setSaving(true);
    try {
      await apiKeysApi.replace(nextKeys);
      if (editingIndex !== null && keys[editingIndex] !== next) {
        saveApiKeyName(apiBase, keys[editingIndex], '');
      }
      if (!saveApiKeyName(apiBase, next, nameDraft)) {
        throw new Error(t('api_keys.label_save_error'));
      }
      setKeys(nextKeys);
      setNames(readApiKeyNames(apiBase));
      closeModal();
      showNotification(t(editingIndex === null ? 'api_keys.added' : 'api_keys.updated'), 'success');
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : t('api_keys.save_error'));
    } finally {
      setSaving(false);
    }
  };

  const deleteKey = (index: number) => {
    showConfirmation({
      title: t('api_keys.delete_title'),
      message: t('api_keys.delete_message', { index: index + 1 }),
      variant: 'danger',
      confirmText: t('api_keys.delete'),
      onConfirm: async () => {
        const nextKeys = keys.filter((_, keyIndex) => keyIndex !== index);
        await apiKeysApi.replace(nextKeys);
        saveApiKeyName(apiBase, keys[index], '');
        setKeys(nextKeys);
        setNames(readApiKeyNames(apiBase));
        showNotification(t('api_keys.deleted'), 'success');
      },
    });
  };

  const copyKey = async (key: string) => {
    const copied = await copyToClipboard(key);
    showNotification(
      t(copied ? 'api_keys.copied' : 'api_keys.copy_error'),
      copied ? 'success' : 'error'
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t('api_keys.eyebrow')}</p>
          <h1>{t('api_keys.title')}</h1>
          <p className={styles.description}>{t('api_keys.description')}</p>
        </div>
        <Button onClick={openAdd}>{t('api_keys.add')}</Button>
      </div>

      <Card className={styles.summary}>
        <div>
          <span className={styles.summaryLabel}>{t('api_keys.configured')}</span>
          <strong>{keys.length}</strong>
        </div>
        <p>{t('api_keys.security_note')}</p>
      </Card>

      {loading ? (
        <div className={styles.centered}>
          <LoadingSpinner />
        </div>
      ) : error ? (
        <Card className={styles.errorCard}>
          <p>{error}</p>
          <Button variant="secondary" onClick={() => void loadKeys()}>
            {t('api_keys.retry')}
          </Button>
        </Card>
      ) : keys.length === 0 ? (
        <Card className={styles.empty}>
          <h2>{t('api_keys.empty_title')}</h2>
          <p>{t('api_keys.empty_description')}</p>
          <Button onClick={openAdd}>{t('api_keys.add_first')}</Button>
        </Card>
      ) : (
        <div className={styles.list}>
          {keys.map((key, index) => (
            <Card key={`${index}-${key}`} className={styles.keyCard}>
              <div className={styles.keyInfo}>
                <div className={styles.index}>#{index + 1}</div>
                <div>
                  <h2>
                    {names[apiKeyNameFingerprint(apiBase, key)] ||
                      t('api_keys.key_name', { index: index + 1 })}
                  </h2>
                  <code>{maskApiKey(key)}</code>
                </div>
              </div>
              <div className={styles.actions}>
                <Button variant="secondary" size="sm" onClick={() => void copyKey(key)}>
                  {t('api_keys.copy')}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => openEdit(index)}>
                  {t('api_keys.edit')}
                </Button>
                <Button variant="danger" size="sm" onClick={() => deleteKey(index)}>
                  {t('api_keys.delete')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={t(editingIndex === null ? 'api_keys.add_title' : 'api_keys.edit_title')}
        closeDisabled={saving}
      >
        <div className={styles.form}>
          <label htmlFor="api-key-value">{t('api_keys.value_label')}</label>
          <div className={styles.inputRow}>
            <input
              id="api-key-value"
              type={showDraft ? 'text' : 'password'}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setFormError('');
              }}
              autoComplete="off"
              autoFocus
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowDraft((visible) => !visible)}
            >
              {t(showDraft ? 'api_keys.hide' : 'api_keys.show')}
            </Button>
          </div>
          <label htmlFor="api-key-name">{t('api_keys.label')}</label>
          <input
            id="api-key-name"
            type="text"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            placeholder={t('api_keys.label_placeholder')}
            maxLength={80}
          />
          <ApiKeyStrengthMeter value={draft} />
          <div className={styles.formActions}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setDraft(generateSecureApiKey())}
            >
              {t('api_keys.generate')}
            </Button>
          </div>
          {formError && <p className={styles.formError}>{formError}</p>}
          <div className={styles.modalFooter}>
            <Button variant="ghost" onClick={closeModal} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void saveDraft()} loading={saving}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
