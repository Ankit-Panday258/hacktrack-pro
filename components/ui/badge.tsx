import * as React from 'react';
export function Badge({ className = '', ...props }: React.HTMLAttributes<HTMLSpanElement>) { return <span className={`ui-badge ${className}`} {...props} />; }
