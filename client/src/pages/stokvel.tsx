import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Plus, Users, TrendingUp, Calendar, DollarSign, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Stokvel {
  id: string;
  name: string;
  description: string;
  purpose: string;
  contributionAmount: number;
  frequency: string;
  members: number;
  totalSaved: number;
  nextPayout: string;
  icon: string;
  color: string;
}

export default function Stokvel() {
  const [view, setView] = useState<"list" | "create" | "details">("list");
  const [selectedStokvel, setSelectedStokvel] = useState<Stokvel | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    purpose: "",
    contributionAmount: "",
    frequency: "monthly",
  });

  const stokvels: Stokvel[] = [
    {
      id: "1",
      name: "Family Savings Circle",
      description: "We save together for big goals",
      purpose: "Home Improvement Fund",
      contributionAmount: 5000,
      frequency: "monthly",
      members: 8,
      totalSaved: 120000,
      nextPayout: "March 15, 2024",
      icon: "👨‍👩‍👧‍👦",
      color: "from-purple-600 to-pink-600",
    },
    {
      id: "2",
      name: "Community Builders",
      description: "Friends saving for vacation",
      purpose: "Group Vacation",
      contributionAmount: 3000,
      frequency: "weekly",
      members: 6,
      totalSaved: 72000,
      nextPayout: "Feb 28, 2024",
      icon: "🏖️",
      color: "from-blue-600 to-cyan-600",
    },
    {
      id: "3",
      name: "Education Fund",
      description: "Colleagues saving for upskilling",
      purpose: "Professional Development",
      contributionAmount: 2500,
      frequency: "monthly",
      members: 12,
      totalSaved: 90000,
      nextPayout: "April 1, 2024",
      icon: "📚",
      color: "from-green-600 to-emerald-600",
    },
  ];

  const handleCreateStokvel = () => {
    if (!formData.name || !formData.purpose || !formData.contributionAmount) {
      toast.error("Please fill all fields");
      return;
    }
    toast.success(`${formData.name} stokvel created successfully!`);
    setFormData({ name: "", purpose: "", contributionAmount: "", frequency: "monthly" });
    setView("list");
  };

  if (view === "create") {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="px-6 pt-12 pb-4 flex items-center relative">
          <button
            onClick={() => setView("list")}
            className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors"
            data-testid="button-back"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="w-full text-center font-heading font-bold text-lg">Create Stokvel</h1>
        </header>

        <div className="px-6 space-y-6">
          <div className="bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl p-6 text-white">
            <h2 className="text-2xl font-bold mb-2">Start a Stokvel</h2>
            <p className="text-purple-100">Invite friends, family, or community to save together</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Stokvel Name</label>
              <input
                type="text"
                placeholder="e.g., Family Savings Circle"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid="input-name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Purpose/Goal</label>
              <input
                type="text"
                placeholder="e.g., Home Renovation, Vacation, Education"
                value={formData.purpose}
                onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid="input-purpose"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <textarea
                placeholder="Tell members about this stokvel..."
                className="w-full px-4 py-3 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary h-20"
                data-testid="input-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Contribution Amount (₦)</label>
                <input
                  type="number"
                  placeholder="5000"
                  value={formData.contributionAmount}
                  onChange={(e) => setFormData({ ...formData, contributionAmount: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-amount"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Frequency</label>
                <select
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="select-frequency"
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>

            <Button
              onClick={handleCreateStokvel}
              className="w-full h-12 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:shadow-lg hover:shadow-purple-500/20"
              data-testid="button-create"
            >
              Create Stokvel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "details" && selectedStokvel) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="px-6 pt-12 pb-4 flex items-center relative">
          <button
            onClick={() => setView("list")}
            className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors"
            data-testid="button-back"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="w-full text-center font-heading font-bold text-lg">{selectedStokvel.name}</h1>
        </header>

        <div className="px-6 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`bg-gradient-to-br ${selectedStokvel.color} rounded-2xl p-6 text-white`}
            data-testid="card-stokvel"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-4xl mb-2">{selectedStokvel.icon}</p>
                <p className="text-sm opacity-90">{selectedStokvel.purpose}</p>
              </div>
              <Users size={24} />
            </div>
          </motion.div>

          <div className="grid grid-cols-2 gap-3">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-secondary rounded-lg p-4"
              data-testid="stat-members"
            >
              <Users size={20} className="text-purple-600 mb-2" />
              <p className="text-2xl font-bold">{selectedStokvel.members}</p>
              <p className="text-xs text-muted-foreground">Members</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="bg-secondary rounded-lg p-4"
              data-testid="stat-saved"
            >
              <TrendingUp size={20} className="text-emerald-600 mb-2" />
              <p className="text-2xl font-bold">₦{selectedStokvel.totalSaved.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Saved</p>
            </motion.div>
          </div>

          <div className="space-y-3">
            <div className="bg-secondary rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <DollarSign size={20} className="text-blue-600" />
                <div>
                  <p className="text-sm font-medium">Next Contribution</p>
                  <p className="text-xs text-muted-foreground">₦{selectedStokvel.contributionAmount.toLocaleString()}</p>
                </div>
              </div>
              <ChevronRight size={20} />
            </div>

            <div className="bg-secondary rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar size={20} className="text-violet-600" />
                <div>
                  <p className="text-sm font-medium">Next Payout</p>
                  <p className="text-xs text-muted-foreground">{selectedStokvel.nextPayout}</p>
                </div>
              </div>
              <ChevronRight size={20} />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold mb-3">Members</h3>
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-secondary rounded-lg" data-testid={`member-${i}`}>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-violet-600 to-pink-600 flex items-center justify-center text-white text-xs font-bold">
                    {String.fromCharCode(64 + i)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Member {i}</p>
                    <p className="text-xs text-muted-foreground">Contributed ₦{selectedStokvel.contributionAmount * i}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Button
              onClick={() => toast.success("Contribution added!")}
              className="w-full h-12 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600"
              data-testid="button-contribute"
            >
              <Plus size={18} className="mr-2" />
              Make Contribution
            </Button>
            <Button
              variant="outline"
              className="w-full h-12 rounded-lg"
              onClick={() => {
                navigator.clipboard.writeText("Join my stokvel: stk-abc123");
                toast.success("Invite link copied!");
              }}
              data-testid="button-invite"
            >
              Invite Members
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-6 pt-12 pb-4 flex items-center relative">
        <Link href="/">
          <button className="absolute left-6 p-2 rounded-full hover:bg-secondary transition-colors" data-testid="button-back">
            <ArrowLeft size={24} />
          </button>
        </Link>
        <h1 className="w-full text-center font-heading font-bold text-lg">Stokvel Groups</h1>
      </header>

      <div className="px-6 space-y-6">
        <p className="text-center text-muted-foreground text-sm">Save together, achieve together</p>

        <Button
          onClick={() => setView("create")}
          className="w-full h-12 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600"
          data-testid="button-create-stokvel"
        >
          <Plus size={18} className="mr-2" />
          Create New Stokvel
        </Button>

        <div className="space-y-3">
          {stokvels.map((stokvel, idx) => (
            <motion.button
              key={stokvel.id}
              onClick={() => {
                setSelectedStokvel(stokvel);
                setView("details");
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              whileHover={{ scale: 1.02 }}
              className={`w-full bg-gradient-to-br ${stokvel.color} rounded-xl p-4 text-white text-left hover:shadow-lg transition-shadow`}
              data-testid={`stokvel-card-${idx}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-2xl mb-1">{stokvel.icon}</p>
                  <p className="font-bold text-lg">{stokvel.name}</p>
                  <p className="text-sm opacity-90">{stokvel.purpose}</p>
                </div>
                <ChevronRight size={24} />
              </div>

              <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/20">
                <div>
                  <p className="text-xs opacity-75">Members</p>
                  <p className="text-lg font-bold">{stokvel.members}</p>
                </div>
                <div>
                  <p className="text-xs opacity-75">Saved</p>
                  <p className="text-sm font-bold">₦{(stokvel.totalSaved / 1000).toFixed(0)}k</p>
                </div>
                <div>
                  <p className="text-xs opacity-75">Frequency</p>
                  <p className="text-sm font-bold capitalize">{stokvel.frequency}</p>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
