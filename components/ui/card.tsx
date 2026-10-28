import * as React from 'react';
export function Card({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={`ui-card ${className}`} {...props} />; }
export function CardContent({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={`ui-card-content ${className}`} {...props} />; }
