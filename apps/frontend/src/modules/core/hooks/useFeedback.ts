import { useState, useCallback } from 'react';

export type FeedbackType = 'success' | 'error' | 'info' | 'confirm';

interface FeedbackState {
  isOpen: boolean;
  title: string;
  message: string;
  type: FeedbackType;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export const useFeedback = () => {
  const [state, setState] = useState<FeedbackState>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  const showFeedback = useCallback((params: {
    title: string;
    message: string;
    type?: FeedbackType;
    onConfirm?: () => void;
    onCancel?: () => void;
  }) => {
    setState({
      isOpen: true,
      title: params.title,
      message: params.message,
      type: params.type || 'info',
      onConfirm: params.onConfirm,
      onCancel: params.onCancel
    });
  }, []);

  const closeFeedback = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false }));
  }, []);

  return {
    feedbackState: state,
    showFeedback,
    closeFeedback
  };
};
