'use client';

import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

type Status = 'checking' | 'online' | 'offline';

export function ApiStatus() {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    const controller = new AbortController();
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3100';

    void fetch(`${baseUrl}/api/v1/health`, { signal: controller.signal })
      .then((response) => {
        setStatus(response.ok ? 'online' : 'offline');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('offline');
      });

    return () => controller.abort();
  }, []);

  if (status === 'online') {
    return (
      <span className="status status--success" role="status">
        <CircleCheck aria-hidden="true" size={14} /> 本地服务正常
      </span>
    );
  }

  if (status === 'offline') {
    return (
      <span className="status status--error" role="status">
        <CircleAlert aria-hidden="true" size={14} /> 本地服务未连接
      </span>
    );
  }

  return (
    <span className="status" role="status">
      <LoaderCircle aria-hidden="true" className="spin" size={14} /> 正在检查服务
    </span>
  );
}
