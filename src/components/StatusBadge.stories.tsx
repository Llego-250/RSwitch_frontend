import type { Meta, StoryObj } from '@storybook/react';
import { StatusBadge } from './StatusBadge';

const meta: Meta<typeof StatusBadge> = {
  title: 'RDIP/Components/StatusBadge',
  component: StatusBadge,
  tags: ['autodocs'],
  argTypes: {
    status: {
      control: 'select',
      options: ['healthy', 'warning', 'failed', 'running', 'queued', 'paused', 'completed', 'draft', 'active', 'inactive'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof StatusBadge>;

export const Healthy: Story = {
  args: {
    status: 'healthy',
  },
};

export const Warning: Story = {
  args: {
    status: 'warning',
  },
};

export const Failed: Story = {
  args: {
    status: 'failed',
  },
};

export const Running: Story = {
  args: {
    status: 'running',
  },
};

export const Draft: Story = {
  args: {
    status: 'draft',
  },
};
