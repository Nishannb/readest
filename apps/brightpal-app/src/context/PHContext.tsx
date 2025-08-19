'use client';

import React, { ReactNode } from 'react';

// Analytics removed – pass-through provider
export const CSPostHogProvider = ({ children }: { children: ReactNode }) => {
  return <>{children}</>;
};
