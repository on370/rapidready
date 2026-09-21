import React from 'react';
import { useTranslation } from 'react-i18next';
import { isMac } from '../../../utils/platform';
import { Command, ArrowBigUp, Lightbulb, Info } from 'lucide-react';

interface KbdProps {
  keys: string[];
}

export function Kbd({ keys }: KbdProps) {
  const { i18n } = useTranslation();
  const isEn = i18n.language?.startsWith('en');

  return (
    <span className="inline-flex items-center gap-1 mx-1 select-none">
      {keys.map((k, i) => {
        if (k === '|') {
          return (
            <span key={i} className="text-txt-tertiary text-xs px-0.5 font-normal">
              /
            </span>
          );
        }

        let label: React.ReactNode = k;
        if (k === 'Cmd') {
          label = isMac ? <Command className="w-3 h-3 inline" /> : (isEn ? 'Ctrl' : 'Strg');
        } else if (k === 'Ctrl') {
          label = isMac ? <Command className="w-3 h-3 inline" /> : (isEn ? 'Ctrl' : 'Strg');
        } else if (k === 'Shift') {
          label = isMac ? <ArrowBigUp className="w-3 h-3 inline" /> : (isEn ? 'Shift' : 'Umschalt');
        } else if (k === 'Opt' || k === 'Alt') {
          label = isMac ? '⌥' : 'Alt';
        } else if (k === 'Space') {
          label = isEn ? 'Space' : 'Leertaste';
        }

        return (
          <span
            key={i}
            className="min-w-[22px] px-1.5 py-0.5 rounded bg-app-deepest border border-app-border text-[11px] font-mono font-medium text-txt-secondary shadow-xs text-center inline-flex items-center justify-center"
          >
            {label}
          </span>
        );
      })}
    </span>
  );
}

interface TipBoxProps {
  title?: string;
  children: React.ReactNode;
}

export function TipBox({ title, children }: TipBoxProps) {
  const { i18n } = useTranslation();
  const isEn = i18n.language?.startsWith('en');
  const defaultTitle = isEn ? 'Pro Tip' : 'Praxis-Tipp';

  return (
    <div className="p-3.5 bg-accent/10 border border-accent/25 rounded-xl flex gap-3 text-xs text-txt-secondary leading-relaxed my-3">
      <Lightbulb className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-accent text-xs">{title || defaultTitle}</span>
        <div>{children}</div>
      </div>
    </div>
  );
}

interface InfoBoxProps {
  title?: string;
  children: React.ReactNode;
}

export function InfoBox({ title, children }: InfoBoxProps) {
  const { i18n } = useTranslation();
  const isEn = i18n.language?.startsWith('en');
  const defaultTitle = isEn ? 'Note' : 'Hinweis';

  return (
    <div className="p-3.5 bg-app-card border border-app-border rounded-xl flex gap-3 text-xs text-txt-secondary leading-relaxed my-3">
      <Info className="w-4 h-4 text-txt-tertiary flex-shrink-0 mt-0.5" />
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-txt-primary text-xs">{title || defaultTitle}</span>
        <div>{children}</div>
      </div>
    </div>
  );
}

interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  badge?: string;
}

export function SectionHeading({ title, subtitle, badge }: SectionHeadingProps) {
  return (
    <div className="border-b border-app-border/60 pb-3 mb-4">
      <div className="flex items-center gap-2.5">
        <h2 className="text-base font-bold text-txt-primary">{title}</h2>
        {badge && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 font-semibold">
            {badge}
          </span>
        )}
      </div>
      {subtitle && <p className="text-xs text-txt-tertiary mt-1 leading-relaxed">{subtitle}</p>}
    </div>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

export function FeatureCard({ icon, title, children }: FeatureCardProps) {
  return (
    <div className="p-3.5 bg-app-card border border-app-border rounded-xl flex flex-col gap-2 shadow-xs">
      <div className="flex items-center gap-2 text-txt-primary font-semibold text-xs">
        <span className="text-accent">{icon}</span>
        <span>{title}</span>
      </div>
      <div className="text-xs text-txt-secondary leading-relaxed">{children}</div>
    </div>
  );
}

interface StepRowProps {
  step: number;
  title: string;
  description: React.ReactNode;
}

export function StepRow({ step, title, description }: StepRowProps) {
  return (
    <div className="flex items-start gap-3 p-3 bg-app-card/60 border border-app-border/60 rounded-xl">
      <div className="w-6 h-6 rounded-full bg-accent/15 border border-accent/30 text-accent font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
        {step}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-txt-primary">{title}</span>
        <div className="text-xs text-txt-secondary leading-relaxed">{description}</div>
      </div>
    </div>
  );
}
