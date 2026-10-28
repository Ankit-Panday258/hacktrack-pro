import * as React from 'react';
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'outline' | 'ghost'; size?: 'default' | 'icon' };
export function Button({ className = '', variant = 'default', size = 'default', ...props }: ButtonProps) {
 return <button className={`ui-button ui-button-${variant} ui-button-${size} ${className}`} {...props} />;
}
