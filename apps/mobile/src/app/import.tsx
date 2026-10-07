import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText, PrimaryButton, Screen, ScreenHeader, TextLink } from '@/components';
import { ColumnMappingForm } from '@/features/imports/ColumnMappingForm';
import { applyMapping, readPickedFile, type ImportStep } from '@/features/imports/flow';
import { ImportPreview } from '@/features/imports/ImportPreview';
import { FileProblemView, ImportIntro, ImportResultView } from '@/features/imports/ImportSteps';
import { mappingProblems } from '@/features/imports/model';
import { pickStatementFile } from '@/features/imports/readFile';
import { goBackOr } from '@/lib/navigation';

/** Lets the "Reading the file…" state paint before the (synchronous) parser runs. */
const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * US-3.2: import a bank statement (docs/IMPORT_GUIDE.md). Choose a file, map the columns of an
 * unknown CSV, check the preview, import, see the result. Opened from Settings → Data sources, or
 * right after onboarding with `?from=onboarding`, where leaving and "Done" go to Home.
 */
export default function ImportScreen() {
  const { t } = useTranslation();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromOnboarding = from === 'onboarding';
  const [step, setStep] = useState<ImportStep>({ kind: 'intro' });
  const [showProblems, setShowProblems] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const leave = () => goBackOr(fromOnboarding ? '/' : '/data-sources');
  const finish = () => router.dismissTo(fromOnboarding ? '/' : '/transactions');

  const choose = async () => {
    const picked = await pickStatementFile(() => setStep({ kind: 'reading' }));
    if (!mounted.current || picked.kind === 'canceled') return;
    if (picked.kind === 'problem') {
      setStep({ kind: 'problem', fileName: picked.name, problem: picked.problem });
      return;
    }
    await nextFrame();
    if (!mounted.current) return;
    setShowProblems(false);
    setStep(readPickedFile(picked.file));
  };

  const header = (
    <ScreenHeader
      backLabel={fromOnboarding ? t('imports.notNow') : t('imports.back')}
      onBack={leave}
      testID="import-header"
    />
  );

  switch (step.kind) {
    case 'preview':
      return (
        <ImportPreview
          header={header}
          file={step.file}
          statement={step.statement}
          onDone={(summary) => setStep({ kind: 'done', summary })}
          onLeave={leave}
        />
      );

    case 'mapping': {
      const continueMapping = () => {
        if (mappingProblems(step.draft).length > 0) {
          setShowProblems(true);
          return;
        }
        setStep(applyMapping(step));
      };
      return (
        <Screen
          scroll
          testID="import-screen"
          footer={
            <>
              <PrimaryButton
                label={t('imports.mapping.continue')}
                onPress={continueMapping}
                testID="import-map-continue"
              />
              <TextLink
                label={t('imports.problems.chooseAnother')}
                onPress={() => void choose()}
                testID="import-map-choose-another"
              />
            </>
          }
        >
          {header}
          <AppText variant="title" accessibilityRole="header">
            {t('imports.mapping.title')}
          </AppText>
          <AppText tone="secondary">{t('imports.mapping.message')}</AppText>
          <ColumnMappingForm
            request={step.request}
            draft={step.draft}
            onChange={(draft) => setStep({ ...step, draft, rejected: false })}
            showProblems={showProblems}
            rejected={step.rejected}
          />
        </Screen>
      );
    }

    case 'done': {
      const needsReview = step.summary.needsReview > 0;
      return (
        <Screen
          scroll
          testID="import-screen"
          footer={
            <>
              {needsReview ? (
                <PrimaryButton
                  label={t('imports.result.review')}
                  onPress={() => router.replace('/review')}
                  testID="import-review"
                />
              ) : null}
              <PrimaryButton
                label={t('imports.result.done')}
                onPress={finish}
                variant={needsReview ? 'secondary' : 'primary'}
                testID="import-done"
              />
            </>
          }
        >
          <AppText variant="title" accessibilityRole="header">
            {t('imports.result.title')}
          </AppText>
          <ImportResultView summary={step.summary} />
        </Screen>
      );
    }

    default:
      return (
        <Screen scroll testID="import-screen">
          {header}
          <AppText variant="title" accessibilityRole="header">
            {t('imports.title')}
          </AppText>
          {step.kind === 'problem' ? (
            <FileProblemView
              fileName={step.fileName}
              problem={step.problem}
              onChooseAnother={() => void choose()}
            />
          ) : (
            <ImportIntro onChoose={() => void choose()} reading={step.kind === 'reading'} />
          )}
        </Screen>
      );
  }
}
