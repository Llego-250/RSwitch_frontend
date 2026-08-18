import type { Preview } from '@storybook/react';
import '../src/styles.css';

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'rdip-paper',
      values: [
        { name: 'rdip-paper', value: '#F4F7F9' },
        { name: 'white', value: '#FFFFFF' },
        { name: 'dark', value: '#172033' },
      ],
    },
  },
};

export default preview;
