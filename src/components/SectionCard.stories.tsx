import type { Meta, StoryObj } from '@storybook/react';
import { SectionCard } from './AppShell';

const meta: Meta<typeof SectionCard> = {
  title: 'RDIP/Components/SectionCard',
  component: SectionCard,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SectionCard>;

export const Default: Story = {
  args: {
    title: 'Participant Operational & Ingestion Trend',
    children: <div className="p-4 text-xs text-[#526174]">Card Content View</div>,
  },
};
