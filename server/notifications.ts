// Simple notification system for deposit confirmations
export interface UserNotification {
  id: string;
  userId: string;
  type: 'deposit_confirmed' | 'deposit_failed';
  title: string;
  message: string;
  data?: any;
  createdAt: Date;
  read: boolean;
}

class NotificationService {
  private notifications: Map<string, UserNotification[]> = new Map();

  /**
   * Send a notification to a user
   */
  notify(notification: Omit<UserNotification, 'id' | 'createdAt' | 'read'>): void {
    const id = Math.random().toString(36).substring(2, 15);
    const fullNotification: UserNotification = {
      ...notification,
      id,
      createdAt: new Date(),
      read: false
    };

    if (!this.notifications.has(notification.userId)) {
      this.notifications.set(notification.userId, []);
    }

    const userNotifications = this.notifications.get(notification.userId)!;
    userNotifications.unshift(fullNotification); // Add to beginning

    // Keep only last 50 notifications per user
    if (userNotifications.length > 50) {
      userNotifications.splice(50);
    }

    console.log(`📧 Notification sent to user ${notification.userId}: ${notification.title}`);
  }

  /**
   * Get unread notifications for a user
   */
  getNotifications(userId: string, limit: number = 10): UserNotification[] {
    const userNotifications = this.notifications.get(userId) || [];
    return userNotifications.slice(0, limit);
  }

  /**
   * Mark a notification as read
   */
  markAsRead(userId: string, notificationId: string): boolean {
    const userNotifications = this.notifications.get(userId) || [];
    const notification = userNotifications.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
      return true;
    }
    return false;
  }

  /**
   * Get count of unread notifications
   */
  getUnreadCount(userId: string): number {
    const userNotifications = this.notifications.get(userId) || [];
    return userNotifications.filter(n => !n.read).length;
  }

  /**
   * Send deposit confirmation notification
   */
  notifyDepositConfirmed(userId: string, amount: string, tokenType: string, transactionHash: string): void {
    this.notify({
      userId,
      type: 'deposit_confirmed',
      title: 'Deposit Confirmed! 💰',
      message: `Your ${amount} ${tokenType} deposit has been confirmed and added to your balance.`,
      data: {
        amount,
        tokenType,
        transactionHash
      }
    });
  }

  /**
   * Send deposit failure notification
   */
  notifyDepositFailed(userId: string, tokenType: string, transactionHash: string, reason: string): void {
    this.notify({
      userId,
      type: 'deposit_failed',
      title: 'Deposit Failed ❌',
      message: `Your ${tokenType} deposit could not be processed: ${reason}`,
      data: {
        tokenType,
        transactionHash,
        reason
      }
    });
  }
}

export const notificationService = new NotificationService();