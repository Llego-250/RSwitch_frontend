import type { Meta, StoryObj } from '@storybook/react';
import { KpiCard } from './KpiCard';

const meta: Meta<typeof KpiCard> = {
  title: 'RDIP/Components/KpiCard',
  component: KpiCard,
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
    source: { control: 'text' },
    freshness: { control: 'radio', options: ['live', 'cached', 'stale'] },
  },
};

export default meta;
type Story = StoryObj<typeof KpiCard>;

export const Default: Story = {
  args: {
    label: 'Active pipelines',
    value: '6 / 7',
    context: '● 1 failed today',
    source: 'pipeline-mon',
    freshness: 'live',
  },
};

export const PositiveDelta: Story = {
  args: {
    label: 'System uptime (30d)',
    value: '99.82%',
    delta: { dir: 'up', text: '+0.02pp', tone: 'good' },
    source: 'uptime-mon',
    freshness: 'live',
  },
};

export const NegativeDelta: Story = {
  args: {
    label: 'Failed integrations',
    value: '1',
    delta: { dir: 'up', text: '+1', tone: 'bad' },
    source: 'catalog',
    freshness: 'live',
  },
};
