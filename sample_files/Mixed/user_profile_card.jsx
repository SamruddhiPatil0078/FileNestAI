import React from 'react';

export default function UserCard({ user }) {
  return (
    <div className='user-card'>
      <h3>{user.name}</h3>
      <p>{user.email}</p>
    </div>
  );
}
